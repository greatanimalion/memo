package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf16"

	"memo/internal/db"
)

// 书籍章节管理工具：列出章节、读取指定章节正文、新建章节、修改指定章节。
// 这里直接操作数据库，不依赖某次写书运行的内部状态；与 agent/booktools.go
// 中绑定 bookAgentRun 的同名工具互不影响（两套注册表相互独立）。

// maxChapterContentChars 限制单次读取返回的章节正文长度（按字符计），
// 避免超长章节挤占模型上下文。
const maxChapterContentChars = 12000

// maxBatchChapterCount 限制一次性批量读取的章节数量。
const maxBatchChapterCount = 5

// previewChapterChars 是批量读取章节时返回给前端的预览字数。
const previewChapterChars = 50

// chapterHeadingRe 匹配章节结果中的标题行（如 "# 标题（id: xxx）"），
// 用于把工具结果加工成前端可读的预览。
var chapterHeadingRe = regexp.MustCompile(`(?m)^# (.+?)（id: [^）]+）$`)

// listChapterIDRe 匹配章节列表里的内部 id，前端预览时移除。
var listChapterIDRe = regexp.MustCompile(`（id: [^，）]+，(\d+) 字）`)

// chapterOpIDRe 匹配新建/更新成功结果末尾的 " (id: xxx)"，前端预览时移除。
var chapterOpIDRe = regexp.MustCompile(` \(id: [^)]+\)`)

type listChaptersArgs struct {
	BookID string `json:"bookId" jsonschema:"description=书籍 ID"`
}

type readChapterArgs struct {
	ChapterID string `json:"chapterId,omitempty" jsonschema:"description=章节 ID；提供时优先使用"`
	BookID    string `json:"bookId,omitempty" jsonschema:"description=书籍 ID；未提供 chapterId 时配合 order 定位章节"`
	Order     int64  `json:"order,omitempty" jsonschema:"description=章节序号；省略时读取该书最后一章"`
}

type readChaptersArgs struct {
	// 与 chapterIds 二选一：按序号读取时需同时提供 bookId。
	ChapterIDs []string `json:"chapterIds,omitempty" jsonschema:"description=章节 ID 列表，最多 5 个"`
	BookID     string   `json:"bookId,omitempty" jsonschema:"description=书籍 ID；使用 orders 定位章节时必填"`
	Orders     []int64  `json:"orders,omitempty" jsonschema:"description=章节序号列表，最多 5 个；与 chapterIds 二选一"`
}

type createChapterArgs struct {
	BookID  string `json:"bookId" jsonschema:"description=书籍 ID"`
	Title   string `json:"title,omitempty" jsonschema:"description=章节标题；省略时按章节序号生成"`
	Content string `json:"content" jsonschema:"description=章节正文（Markdown）"`
	Order   int64  `json:"order,omitempty" jsonschema:"description=章节序号；省略时自动追加到末尾"`
}

type updateChapterContentArgs struct {
	ChapterID string `json:"chapterId" jsonschema:"description=要修改的章节 ID"`
	// 指针字段用于区分“未提供”与“提供空字符串”，只更新显式给出的字段。
	Title   *string `json:"title,omitempty" jsonschema:"description=新的章节标题；省略则不修改"`
	Content *string `json:"content,omitempty" jsonschema:"description=新的章节正文（Markdown）；省略则不修改"`
}

func listChaptersTool() (*Tool, error) {
	tool, err := NewTool[listChaptersArgs]("list_chapters", "列出指定书籍的全部章节（章节 ID、标题、序号与字数）",
		func(_ context.Context, args listChaptersArgs) (string, error) {
			return listChapters(args)
		})
	if err != nil {
		return nil, err
	}
	return tool.SetPreview(previewChapterList), nil
}

func readChapterTool() (*Tool, error) {
	tool, err := NewTool[readChapterArgs]("read_chapter", "读取指定章节的完整正文；可用 chapterId，或 bookId + order；省略时读取该书最后一章",
		func(_ context.Context, args readChapterArgs) (string, error) {
			return readChapter(args)
		})
	if err != nil {
		return nil, err
	}
	return tool.SetPreview(func(result string) string { return previewChapterBlocks(result, false) }), nil
}

// readChaptersTool 一次性读取多个章节：模型拿到完整正文，
// 前端只展示前 50 个字符的预览。
func readChaptersTool() (*Tool, error) {
	tool, err := NewTool[readChaptersArgs]("read_chapters", "一次性读取多个章节的完整正文（最多 5 章）；可用 chapterIds，或 bookId + orders",
		func(_ context.Context, args readChaptersArgs) (string, error) {
			return readChapters(args)
		})
	if err != nil {
		return nil, err
	}
	return tool.
		SetPreview(func(result string) string { return previewChapterBlocks(result, true) }).
		// 章节正文通常远超常规工具结果上限，这里保持完整交给模型
		SetKeepFullResult(true), nil
}

func createChapterTool() (*Tool, error) {
	tool, err := NewTool[createChapterArgs]("create_chapter", "在指定书籍中新建一个章节并保存正文",
		func(_ context.Context, args createChapterArgs) (string, error) {
			return createChapter(args)
		})
	if err != nil {
		return nil, err
	}
	return tool.SetPreview(previewChapterOp), nil
}

func updateChapterTool() (*Tool, error) {
	tool, err := NewTool[updateChapterContentArgs]("update_chapter", "修改指定章节的标题或正文",
		func(_ context.Context, args updateChapterContentArgs) (string, error) {
			return updateChapter(args)
		})
	if err != nil {
		return nil, err
	}
	return tool.SetPreview(previewChapterOp), nil
}

// listChapters 列出书籍的全部章节元数据（不含正文）。
func listChapters(args listChaptersArgs) (string, error) {
	bookID := strings.TrimSpace(args.BookID)
	if bookID == "" {
		return "", errors.New("bookId: required")
	}
	book, err := db.GetBook(bookID)
	if err != nil {
		return "", err
	}
	if book == nil {
		return fmt.Sprintf("未找到 id 为 %s 的书籍", bookID), nil
	}
	chapters, err := db.GetChapterMetaByBookID(bookID)
	if err != nil {
		return "", err
	}
	if len(chapters) == 0 {
		return fmt.Sprintf("《%s》暂无章节", book.Title), nil
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "《%s》共 %d 章：", book.Title, len(chapters))
	for _, c := range chapters {
		fmt.Fprintf(&sb, "\n- [%d] %s（id: %s，%d 字）", c.Order, c.Title, c.ID, c.WordCount)
	}
	return sb.String(), nil
}

// readChapter 读取章节正文：优先按 chapterId，其次按 bookId + order，
// 都未提供时读取该书最后一章。
func readChapter(args readChapterArgs) (string, error) {
	if chapterID := strings.TrimSpace(args.ChapterID); chapterID != "" {
		chapter, err := db.GetChapter(chapterID)
		if err != nil {
			return "", err
		}
		if chapter == nil {
			return fmt.Sprintf("未找到 id 为 %s 的章节", chapterID), nil
		}
		return formatChapterContent(chapter), nil
	}

	bookID := strings.TrimSpace(args.BookID)
	if bookID == "" {
		return "", errors.New("chapterId 或 bookId: required")
	}
	var (
		chapter *db.Chapter
		err     error
	)
	if args.Order > 0 {
		chapter, err = db.GetChapterByOrder(bookID, args.Order)
	} else {
		chapter, err = db.GetLastChapterByBookID(bookID)
	}
	if err != nil {
		return "", err
	}
	if chapter == nil {
		if args.Order > 0 {
			return fmt.Sprintf("未找到第 %d 章的章节", args.Order), nil
		}
		return "该书暂无已保存章节", nil
	}
	return formatChapterContent(chapter), nil
}

// formatChapterContent 渲染单章正文，超长时按字符截断。
func formatChapterContent(chapter *db.Chapter) string {
	content := chapter.EffectiveContent()
	if runes := []rune(content); len(runes) > maxChapterContentChars {
		content = string(runes[:maxChapterContentChars]) + "\n……（内容过长已截断）"
	}
	if strings.TrimSpace(content) == "" {
		content = "（正文为空）"
	}
	return fmt.Sprintf("# %s（id: %s）\n\n%s", chapter.Title, chapter.ID, content)
}

// createChapter 新建章节并保存正文。AI 写的正文写入 aiRes，content 只由
// 人工编辑写入，与写书 Agent 的保存策略保持一致。
func createChapter(args createChapterArgs) (string, error) {
	bookID := strings.TrimSpace(args.BookID)
	if bookID == "" {
		return "", errors.New("bookId: required")
	}
	content := strings.TrimSpace(args.Content)
	if content == "" {
		return "", errors.New("content: required")
	}
	book, err := db.GetBook(bookID)
	if err != nil {
		return "", err
	}
	if book == nil {
		return fmt.Sprintf("未找到 id 为 %s 的书籍", bookID), nil
	}

	order := args.Order
	if order <= 0 {
		maxOrder, err := db.GetMaxChapterOrder(bookID)
		if err != nil {
			return "", err
		}
		order = maxOrder + 1
	}
	title := strings.TrimSpace(args.Title)
	if title == "" {
		title = fmt.Sprintf("第%d章", order)
	}

	chapter := &db.Chapter{
		ID:        db.NewID(),
		BookID:    bookID,
		Title:     title,
		AIRes:     content,
		IsAI:      1,
		WordCount: int64(chapterTextLen(content)),
		Order:     order,
		Metadata:  json.RawMessage("{}"),
	}
	if _, err := db.CreateChapter(chapter); err != nil {
		return "", err
	}
	return fmt.Sprintf("章节创建成功: %s (id: %s)", chapter.Title, chapter.ID), nil
}

// updateChapter 修改指定章节的标题或正文，只更新显式提供的字段。
func updateChapter(args updateChapterContentArgs) (string, error) {
	chapterID := strings.TrimSpace(args.ChapterID)
	if chapterID == "" {
		return "", errors.New("chapterId: required")
	}
	if args.Title == nil && args.Content == nil {
		return "未提供 title 或 content，未做任何修改", nil
	}

	updates := map[string]any{}
	if args.Title != nil {
		title := strings.TrimSpace(*args.Title)
		if title == "" {
			return "", errors.New("title: required")
		}
		updates["title"] = title
	}
	if args.Content != nil {
		content := strings.TrimSpace(*args.Content)
		if content == "" {
			return "", errors.New("content: required")
		}
		// AI 写的正文写入 aiRes，content 只由人工编辑写入。
		updates["aiRes"] = content
		updates["isAi"] = int64(1)
		updates["wordCount"] = int64(chapterTextLen(content))
	}

	chapter, err := db.UpdateChapter(chapterID, updates)
	if err != nil {
		return "", err
	}
	if chapter == nil {
		return fmt.Sprintf("未找到 id 为 %s 的章节，未做任何修改", chapterID), nil
	}
	return fmt.Sprintf("章节更新成功: %s (id: %s)", chapter.Title, chapter.ID), nil
}

// readChapters 批量读取章节完整正文：可用 chapterIds，或 bookId + orders。
// 最多读取 5 章，正文不做长度截断（预览截断由工具声明中的 SetPreview 负责）。
func readChapters(args readChaptersArgs) (string, error) {
	chapterIDs := make([]string, 0, len(args.ChapterIDs))
	for _, id := range args.ChapterIDs {
		if id = strings.TrimSpace(id); id != "" {
			chapterIDs = append(chapterIDs, id)
		}
	}
	orders := args.Orders

	if len(chapterIDs) == 0 && len(orders) == 0 {
		return "", errors.New("chapterIds 或 bookId + orders: required")
	}
	if len(chapterIDs) > 0 && len(orders) > 0 {
		return "", errors.New("chapterIds 与 orders 不能同时提供")
	}
	if len(chapterIDs) > maxBatchChapterCount {
		return "", fmt.Errorf("一次最多读取 %d 个章节，当前提供了 %d 个", maxBatchChapterCount, len(chapterIDs))
	}
	if len(orders) > maxBatchChapterCount {
		return "", fmt.Errorf("一次最多读取 %d 个章节，当前提供了 %d 个", maxBatchChapterCount, len(orders))
	}

	chapters := make([]*db.Chapter, 0, len(chapterIDs)+len(orders))
	if len(chapterIDs) > 0 {
		for _, id := range chapterIDs {
			chapter, err := db.GetChapter(id)
			if err != nil {
				return "", err
			}
			if chapter == nil {
				return fmt.Sprintf("未找到 id 为 %s 的章节", id), nil
			}
			chapters = append(chapters, chapter)
		}
	} else {
		bookID := strings.TrimSpace(args.BookID)
		if bookID == "" {
			return "", errors.New("bookId: required")
		}
		for _, order := range orders {
			if order <= 0 {
				return "", fmt.Errorf("order 必须为正整数: %d", order)
			}
			chapter, err := db.GetChapterByOrder(bookID, order)
			if err != nil {
				return "", err
			}
			if chapter == nil {
				return fmt.Sprintf("未找到第 %d 章的章节", order), nil
			}
			chapters = append(chapters, chapter)
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "共读取 %d 个章节：", len(chapters))
	for _, chapter := range chapters {
		content := chapter.EffectiveContent()
		if strings.TrimSpace(content) == "" {
			content = "（正文为空）"
		}
		fmt.Fprintf(&sb, "\n\n# %s（id: %s，第 %d 章）\n\n%s", chapter.Title, chapter.ID, chapter.Order, content)
	}
	return sb.String(), nil
}

// previewFirstRunes 取前 n 个字符作为前端预览，超出部分用省略号代替。
func previewFirstRunes(text string, n int) string {
	runes := []rune(text)
	if len(runes) <= n {
		return text
	}
	return string(runes[:n]) + "…"
}

// previewChapterBlocks 把读取章节的工具结果加工成前端可读摘要：
// 只保留章节名称、字数与内容开头，隐藏内部 id。
// withTotal 为 true 时（批量读取）先输出章节总数。
func previewChapterBlocks(result string, withTotal bool) string {
	matches := chapterHeadingRe.FindAllStringSubmatchIndex(result, -1)
	if len(matches) == 0 {
		return result
	}

	var out strings.Builder
	if withTotal {
		fmt.Fprintf(&out, "共读取 %d 个章节", len(matches))
	}
	for i, m := range matches {
		title := result[m[2]:m[3]]
		bodyStart := m[1]
		bodyEnd := len(result)
		if i+1 < len(matches) {
			bodyEnd = matches[i+1][0]
		}
		body := strings.TrimSpace(result[bodyStart:bodyEnd])
		if body == "" {
			body = "（正文为空）"
		}
		// 内容压缩为一行，避免前端节点里换行被折叠
		oneLine := strings.Join(strings.Fields(body), " ")
		if out.Len() > 0 {
			out.WriteString("\n\n")
		}
		fmt.Fprintf(&out, "章节名称：%s\n字数：%d\n内容：%s",
			title, chapterTextLen(body), previewFirstRunes(oneLine, previewChapterChars))
	}
	return out.String()
}

// previewChapterList 移除章节列表里的内部 id，只保留序号、标题与字数。
func previewChapterList(result string) string {
	return listChapterIDRe.ReplaceAllString(result, "（$1 字）")
}

// previewChapterOp 移除新建/更新成功结果里的内部 id。
func previewChapterOp(result string) string {
	return chapterOpIDRe.ReplaceAllString(result, "")
}

// chapterTextLen 按 UTF-16 码元计数，与前端 JavaScript 的 String#length 一致。
func chapterTextLen(s string) int {
	return len(utf16.Encode([]rune(s)))
}
