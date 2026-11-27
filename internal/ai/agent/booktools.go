package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"memo/internal/ai/tools"
)

// 写书工具：Input 结构体仅用于反射生成参数 schema，执行时由 tools.NewTool
// 解析参数后交给 bookAgentRun 上带运行态的方法。
type (
	routeArgs struct {
		Target string `json:"target" jsonschema:"description=目标 Agent 或 end,enum=orchestrator,enum=architect,enum=character,enum=writer,enum=guard,enum=end"`
	}
	getBookInfoArgs struct {
		BookID string `json:"bookId,omitempty" jsonschema:"description=书籍 ID，省略时使用当前书籍"`
	}
	getChapterArgs struct {
		ChapterID string `json:"chapterId,omitempty" jsonschema:"description=章节 ID"`
		BookID    string `json:"bookId,omitempty" jsonschema:"description=书籍 ID，省略时使用当前书籍"`
	}
	saveChapterArgs struct {
		BookID  string `json:"bookId" jsonschema:"description=书籍 ID"`
		Title   string `json:"title" jsonschema:"description=章节标题"`
		Content string `json:"content" jsonschema:"description=章节正文（Markdown）"`
		Order   int64  `json:"order,omitempty" jsonschema:"description=章节序号"`
	}
	updateChapterArgs struct {
		ChapterID string `json:"chapterId" jsonschema:"description=章节 ID"`
		// 指针字段用于区分“未提供”与“提供空字符串”，保持原有的更新语义。
		Title   *string `json:"title,omitempty" jsonschema:"description=新标题"`
		Content *string `json:"content,omitempty" jsonschema:"description=新正文（Markdown）"`
	}
)

// newBookToolRegistry 构建绑定到某次写书运行的注册表。r 为 nil 时只用于
// 读取工具声明（执行函数不会被调用）。
func newBookToolRegistry(r *bookAgentRun) *tools.Registry {
	return tools.New(
		tools.Must(tools.NewTool[routeArgs]("route", "切换流程到下一个 Agent。一次只调用一个 route。",
			func(_ context.Context, args routeArgs) (string, error) {
				return r.toolRoute(args)
			})),
		tools.Must(tools.NewTool[getBookInfoArgs]("get_book_info", "获取书籍信息与已保存章节列表（不含正文）",
			func(_ context.Context, args getBookInfoArgs) (string, error) {
				return r.toolGetBookInfo(args)
			})).SetPreview(previewBookInfo),
		tools.Must(tools.NewTool[getChapterArgs]("get_chapter", "读取指定章节的完整正文；省略 chapterId 时返回当前书籍最后一章",
			func(_ context.Context, args getChapterArgs) (string, error) {
				return r.toolGetChapter(args)
			})).SetPreview(previewBookChapter),
		// 写章节的工具会读写 r.chapterID / lastDraft，必须串行执行。
		tools.Must(tools.NewTool[saveChapterArgs]("save_chapter", "新建章节并保存正文",
			func(_ context.Context, args saveChapterArgs) (string, error) {
				return r.toolSaveChapter(args)
			})).SetExclusive(true).SetPreview(previewChapterOpResult),
		tools.Must(tools.NewTool[updateChapterArgs]("update_chapter", "更新已有章节的标题或正文",
			func(_ context.Context, args updateChapterArgs) (string, error) {
				return r.toolUpdateChapter(args)
			})).SetExclusive(true).SetPreview(previewChapterOpResult),
	)
}

// previewChapterOpIDRe 匹配保存/更新结果末尾的 " (id: xxx)"，前端预览时移除。
var previewChapterOpIDRe = regexp.MustCompile(` \(id: [^)]+\)`)

// previewBookInfo 把 get_book_info 的 JSON 结果加工成前端可读摘要：
// 只保留书名、简介、标签与章节序号/标题/字数，隐藏内部 id。
func previewBookInfo(result string) string {
	var payload bookInfoPayload
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		return result
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "《%s》", payload.Title)
	if desc := strings.TrimSpace(payload.Description); desc != "" {
		fmt.Fprintf(&sb, "\n简介：%s", desc)
	}
	if tags := strings.TrimSpace(string(payload.Tags)); tags != "" && tags != "[]" && tags != "null" {
		fmt.Fprintf(&sb, "\n标签：%s", tags)
	}
	fmt.Fprintf(&sb, "\n共 %d 章", payload.ChapterCount)
	for _, c := range payload.Chapters {
		fmt.Fprintf(&sb, "\n第 %d 章 %s（%d 字）", c.Order, c.Title, c.WordCount)
	}
	return sb.String()
}

// previewBookChapter 把 get_chapter 的 "# 标题\n\n正文" 加工成
// 章节名称/字数/内容开头，避免前端直接看到整章正文。
func previewBookChapter(result string) string {
	if !strings.HasPrefix(result, "# ") {
		return result
	}
	rest := strings.TrimPrefix(result, "# ")
	idx := strings.Index(rest, "\n\n")
	if idx < 0 {
		return result
	}
	title := strings.TrimSpace(rest[:idx])
	body := strings.TrimSpace(rest[idx+2:])
	if body == "" {
		body = "（正文为空）"
	}
	oneLine := strings.Join(strings.Fields(body), " ")
	if runes := []rune(oneLine); len(runes) > 50 {
		oneLine = string(runes[:50]) + "…"
	}
	return fmt.Sprintf("章节名称：%s\n字数：%d\n内容：%s", title, jsLen(body), oneLine)
}

// previewChapterOpResult 去掉保存/更新成功结果里的内部 id。
func previewChapterOpResult(result string) string {
	return previewChapterOpIDRe.ReplaceAllString(result, "")
}

// ──────────────────── 旧实现（保留备查，不再使用） ────────────────────
//
// 旧实现用 tools.DefineMap 接收 map[string]any 参数，执行时再在
// bookAgentRun 的方法里做类型断言；现改为 tools.NewTool 直接解析到
// 下面的 Input 结构体，原写法保留如下：
//
// func newBookToolRegistry(r *bookAgentRun) *tools.Registry {
// 	return tools.New(
// 		tools.DefineMap[routeArgs]("route", "切换流程到下一个 Agent。一次只调用一个 route。", tools.Meta{},
// 			func(_ context.Context, args map[string]any) (string, error) {
// 				return r.toolRoute(args)
// 			}),
// 		tools.DefineMap[getBookInfoArgs]("get_book_info", "获取书籍信息与已保存章节列表（不含正文）", tools.Meta{},
// 			func(_ context.Context, args map[string]any) (string, error) {
// 				return r.toolGetBookInfo(args)
// 			}),
// 		tools.DefineMap[getChapterArgs]("get_chapter", "读取指定章节的完整正文；省略 chapterId 时返回当前书籍最后一章", tools.Meta{},
// 			func(_ context.Context, args map[string]any) (string, error) {
// 				return r.toolGetChapter(args)
// 			}),
// 		// 写章节的工具会读写 r.chapterID / lastDraft，必须串行执行。
// 		tools.DefineMap[saveChapterArgs]("save_chapter", "新建章节并保存正文", tools.Meta{Exclusive: true},
// 			func(_ context.Context, args map[string]any) (string, error) {
// 				return r.toolSaveChapter(args)
// 			}),
// 		tools.DefineMap[updateChapterArgs]("update_chapter", "更新已有章节的标题或正文", tools.Meta{Exclusive: true},
// 			func(_ context.Context, args map[string]any) (string, error) {
// 				return r.toolUpdateChapter(args)
// 			}),
// 	)
// }
