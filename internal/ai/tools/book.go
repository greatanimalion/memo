package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

type listChaptersArgs struct {
	BookID string `json:"bookId" jsonschema:"description=书籍 ID"`
}

type readChapterArgs struct {
	ChapterID string `json:"chapterId,omitempty" jsonschema:"description=章节 ID；提供时优先使用"`
	BookID    string `json:"bookId,omitempty" jsonschema:"description=书籍 ID；未提供 chapterId 时配合 order 定位章节"`
	Order     int64  `json:"order,omitempty" jsonschema:"description=章节序号；省略时读取该书最后一章"`
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
	return NewTool[listChaptersArgs]("list_chapters", "列出指定书籍的全部章节（章节 ID、标题、序号与字数）",
		func(_ context.Context, args listChaptersArgs) (string, error) {
			return listChapters(args)
		})
}

func readChapterTool() (*Tool, error) {
	return NewTool[readChapterArgs]("read_chapter", "读取指定章节的完整正文；可用 chapterId，或 bookId + order；省略时读取该书最后一章",
		func(_ context.Context, args readChapterArgs) (string, error) {
			return readChapter(args)
		})
}

func createChapterTool() (*Tool, error) {
	return NewTool[createChapterArgs]("create_chapter", "在指定书籍中新建一个章节并保存正文",
		func(_ context.Context, args createChapterArgs) (string, error) {
			return createChapter(args)
		})
}

func updateChapterTool() (*Tool, error) {
	return NewTool[updateChapterContentArgs]("update_chapter", "修改指定章节的标题或正文",
		func(_ context.Context, args updateChapterContentArgs) (string, error) {
			return updateChapter(args)
		})
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

// chapterTextLen 按 UTF-16 码元计数，与前端 JavaScript 的 String#length 一致。
func chapterTextLen(s string) int {
	return len(utf16.Encode([]rune(s)))
}
