package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"memo/internal/db"
)

// ──────────────────── Prompts (verbatim from promot/*.ts) ────────────────────

const bookAgentOrchestratorPrompt = `你是一个图书项目的总调度员。

## 核心职责
你的唯一职责是**调度流程**，你不需要：
- 不需要构思内容
- 不需要写作
- 不需要编辑
- 不需要调用 get_book_info、save_chapter、update_chapter

## 你可以做的事
- 调用 route 工具切换到下一个 agent

## 首次启动
当你收到用户需求时，直接调用：
route({ "target": "thinker" })

## 收到其他 Agent 返回后
当 thinker/writer/editor/consistency 返回内容后，你需要判断下一步：
- thinker 返回大纲 → 调用 route({ "target": "writer" })
- writer 返回正文 → 调用 route({ "target": "editor" })
- editor 返回润色后内容 → 调用 route({ "target": "consistency" })
- consistency 返回检查结果 → 调用 route({ "target": "end" })

## 重要
1. 每次只调用一个 route 工具，不要同时调用其他工具
2. 不要在回复中描述你要做什么，直接调用 route
3. 你的回复应该简短，例如："已收到，切换到下一阶段"`

const bookAgentThinkerPrompt = `你是构思Agent，专门负责创作大纲。

## 你的任务
根据用户需求和书籍信息，输出一份完整的书籍大纲。

## 输出格式
直接输出大纲内容，不要添加任何解释或说明。使用以下格式：

# [书名]

## 一句话核心
[全书主旨概括]

## 梗概
[200-300字完整梗概]

## 章节目录

### 第一章: [标题]
- 概要: [核心内容]
- 预计字数: [字数]

### 第二章: [标题]
- 概要: [核心内容]
- 预计字数: [字数]

（根据需要添加更多章节）

## 重要规则
1. 输出完整的大纲后，**必须**调用 route 工具：
   route({ "target": "writer" })
2. 不要调用 get_book_info、save_chapter、update_chapter
3. 大纲要具体可执行，每章概要2-3句话
4. 小说控制在15-30章，非虚构8-15章`

const bookAgentWriterPrompt = `你是写作Agent。

## 你的唯一任务
根据大纲撰写章节正文。你必须输出完整的章节正文内容。

## 输出要求
你的回复必须是章节正文本身，格式如下：

# 第X章 [标题]

[正文内容，至少500字]

## 重要规则
1. 你的回复必须是小说/书籍正文，不是调度信息
2. 不要包含"已收到"、"现调度"、"route"等调度语言
3. 完成后调用 route 工具切换到 editor

## 禁止输出
- 不要输出调度信息
- 不要输出"我将..."
- 不要输出 route 调用说明（直接调用即可）

## 正文要求
- 内容要具体生动，有场景描写、人物对话
- 每章至少500字
- 保持叙述连贯性`

const bookAgentEditorPrompt = `你是编辑Agent，专门负责润色章节内容。

## 你的任务
对章节正文进行编辑润色，提升可读性和流畅度。

## 输出格式
直接输出修改后的完整章节内容（Markdown格式），并在末尾附上修改说明。

## 重要规则
1. 输出完整内容后，**必须**调用 route 工具：
   route({ "target": "consistency" })
2. 不要调用 get_book_info、save_chapter、update_chapter
3. 保持原意，只优化表达
4. 修改要具体可追溯

## 编辑要点
- 修正语法错误和错别字
- 润色句子，使其更简洁有力
- 调整段落结构，使逻辑更清晰
- 确保全文语气风格一致`

const bookAgentConsistencyPrompt = `你是检查Agent，专门负责检查内容一致性。

## 你的任务
检查章节内容与已有内容的一致性，确保没有矛盾。

## 输出格式
直接输出检查报告，包含：
- 检查范围
- 通过项
- 未通过项（如有）
- 总结建议

## 重要规则
1. 输出完整报告后，**必须**调用 route 工具：
   route({ "target": "orchestrator" })
2. 不要调用 get_book_info、save_chapter、update_chapter
3. 检查要客观准确
4. 矛盾描述要具体

## 检查要点
- 角色属性一致性（年龄、外貌、能力）
- 时间线一致性（事件顺序、时间间隔）
- 空间设定一致性（地点、距离）
- 逻辑合理性（因果关系、情节推进）`

var bookAgentPrompts = map[string]string{
	"orchestrator": bookAgentOrchestratorPrompt,
	"thinker":      bookAgentThinkerPrompt,
	"writer":       bookAgentWriterPrompt,
	"editor":       bookAgentEditorPrompt,
	"consistency":  bookAgentConsistencyPrompt,
}

const (
	bookAgentCancelText        = "任务已取消"
	bookAgentEnd               = "__end__"
	bookAgentMaxStepCount      = 20
	bookAgentMaxNodeExecutions = 200
)

// BookAgentRequest is the JSON body accepted by POST /api/book-agent.
type BookAgentRequest struct {
	Prompt    string `json:"prompt"`
	BookID    string `json:"bookId"`
	Model     string `json:"model"`
	BaseURL   string `json:"baseUrl"`
	APIKey    string `json:"apiKey"`
	RequestID string `json:"requestId"`
}

// RunBookAgent mirrors BookAgentRunner.run: a multi agent writing workflow
// driven by an explicit route tool, streaming SSE events to the client.
func RunBookAgent(parent context.Context, req BookAgentRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		RegisterAbort(req.RequestID, cancel)
		defer UnregisterAbort(req.RequestID)
	}

	run := &bookAgentRun{
		client: NewClient(ResolveRequest(req.Model, req.BaseURL), req.APIKey, "", 0.7),
		sse:    sse,
		prompt: req.Prompt,
		bookID: req.BookID,
	}
	run.run(ctx)
}

// ──────────────────── run state ────────────────────

type convMessage struct {
	Agent     string `json:"agent"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type bookToolCall struct {
	Name string
	Args map[string]any
	ID   string
}

type toolResult struct {
	ID      string
	Name    string
	Content string
}

type bookAgentRun struct {
	client *Client
	sse    Emitter
	prompt string
	bookID string

	recordID     string
	messages     []Message
	currentPhase string
	currentAgent string
	stepCount    int
	chapterOrder int

	draftChapterID string

	pendingRoute string
	pendingMu    sync.Mutex

	conversation []convMessage
}

func (r *bookAgentRun) run(ctx context.Context) {
	r.recordID = db.NewID()
	_, _ = db.CreateBookAgent(&db.BookAgent{
		ID:       r.recordID,
		BookID:   r.bookID,
		Title:    jsSlice(r.prompt, 0, 50),
		Messages: json.RawMessage("[]"),
		Status:   "running",
	})

	r.messages = []Message{{
		Role: "user",
		Content: fmt.Sprintf(
			"## 项目任务\n\n书籍ID: %s\n\n%s\n\n用户需求: %s\n\n请根据以上信息制定创作计划，并调度各Agent执行。",
			r.bookID, r.buildBookInfo(), r.prompt),
	}}
	r.currentPhase = "orchestrator"
	r.currentAgent = "orchestrator"
	r.stepCount = 0
	r.chapterOrder = 1

	node := "orchestrator"
	status := "done"

	for iterations := 0; iterations < bookAgentMaxNodeExecutions; iterations++ {
		if ctx.Err() != nil {
			status = "cancelled"
			r.sse.Write("cancel", bookAgentCancelText)
			break
		}

		if node == "tools" {
			results := r.executeTools()
			for _, res := range results {
				r.sse.Write("tool", jsonPayload(toolResultEvent{Name: res.Name, Result: res.Content}))
				r.conversation = append(r.conversation, convMessage{
					Agent:     r.currentAgent,
					Role:      "tool",
					Content:   fmt.Sprintf("[%s] %s", res.Name, res.Content),
					Timestamp: time.Now().UnixMilli(),
				})
				r.messages = append(r.messages, Message{
					Role:       "tool",
					Content:    res.Content,
					ToolCallID: res.ID,
					Name:       res.Name,
				})
			}
			node = "orchestrator"
			continue
		}

		r.currentAgent = node
		msg, err := r.runAgent(ctx, node)
		if err != nil {
			if ctx.Err() != nil {
				status = "cancelled"
				r.sse.Write("cancel", bookAgentCancelText)
			} else {
				status = "error"
				log.Printf("BookAgent 执行错误: %v", err)
				r.sse.Write("error", err.Error())
			}
			break
		}

		r.stepCount++
		r.currentPhase = node
		r.messages = append(r.messages, *msg)

		if node == "writer" {
			r.autoSaveWriter(msg.Content)
			r.chapterOrder++
		}

		if hasValidBookToolCalls(msg) {
			node = "tools"
			continue
		}
		next := r.routePhase()
		if next == bookAgentEnd {
			break
		}
		node = next
	}

	r.sse.Write("done", doneEventText)
	r.finish(status)
}

// runAgent executes one agent node: it streams the completion and derives the
// tool calls from the DSML / text fallbacks (tools are never bound, mirroring
// createAgentNode).
func (r *bookAgentRun) runAgent(ctx context.Context, node string) (*Message, error) {
	prompt, ok := bookAgentPrompts[node]
	if !ok {
		prompt = bookAgentPrompts["orchestrator"]
	}

	msgs := make([]Message, 0, len(r.messages)+1)
	msgs = append(msgs, Message{Role: "system", Content: prompt})
	msgs = append(msgs, r.messages...)

	r.sse.Write("agent", jsonPayload(agentEvent{Name: node}))

	msg, err := r.client.Stream(ctx, msgs, nil, func(fragment string) {
		if fragment == "" || ctx.Err() != nil {
			return
		}
		r.sse.Write("message", fragment)
	})
	if err != nil {
		return nil, err
	}

	fullContent := msg.Content
	calls := r.collectToolCalls(msg, fullContent)
	for _, c := range calls {
		r.sse.Write("tool_call", jsonPayload(bookAgentToolCallEvent{Agent: node, Name: c.Name}))
	}

	out := &Message{Role: "assistant", Content: fullContent}
	for _, c := range calls {
		argsJSON, _ := json.Marshal(c.Args)
		out.ToolCalls = append(out.ToolCalls, ToolCall{
			ID:   c.ID,
			Type: "function",
			Function: ToolCallFunction{
				Name:      c.Name,
				Arguments: string(argsJSON),
			},
		})
	}

	if fullContent != "" {
		r.conversation = append(r.conversation, convMessage{
			Agent:     node,
			Role:      "assistant",
			Content:   fullContent,
			Timestamp: time.Now().UnixMilli(),
		})
	}
	return out, nil
}

// collectToolCalls merges the standard tool calls returned by the model with
// the DSML encoding and, as a last resort, the plain text heuristics.
func (r *bookAgentRun) collectToolCalls(msg *Message, fullContent string) []bookToolCall {
	calls := make([]bookToolCall, 0, len(msg.ToolCalls)+1)
	for _, tc := range msg.ToolCalls {
		args := map[string]any{}
		if tc.Function.Arguments != "" {
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
		}
		calls = append(calls, bookToolCall{Name: tc.Function.Name, Args: args, ID: tc.ID})
	}

	if strings.Contains(fullContent, "<｜｜DSML｜｜tool_calls>") {
		for _, dc := range parseDSMLToolCalls(fullContent) {
			if !containsBookToolCall(calls, dc) {
				calls = append(calls, dc)
			}
		}
	}

	if len(calls) == 0 {
		calls = append(calls, parseTextToolCalls(fullContent)...)
	}
	return calls
}

// ──────────────────── routing ────────────────────

func hasValidBookToolCalls(msg *Message) bool {
	for _, tc := range msg.ToolCalls {
		args := map[string]any{}
		if tc.Function.Arguments != "" {
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
		}
		if len(args) > 0 {
			return true
		}
	}
	return false
}

func (r *bookAgentRun) routePhase() string {
	if r.stepCount >= bookAgentMaxStepCount {
		return bookAgentEnd
	}

	r.pendingMu.Lock()
	target := r.pendingRoute
	r.pendingRoute = ""
	r.pendingMu.Unlock()

	if target != "" {
		if target == "end" {
			return bookAgentEnd
		}
		return target
	}

	switch r.currentPhase {
	case "thinker":
		return "orchestrator"
	case "writer":
		return "editor"
	case "editor":
		return "consistency"
	case "consistency":
		return "orchestrator"
	default:
		return "thinker"
	}
}

// ──────────────────── tool execution ────────────────────

func (r *bookAgentRun) executeTools() []toolResult {
	if len(r.messages) == 0 {
		return nil
	}
	calls := parseMessageToolCalls(r.messages[len(r.messages)-1])
	if len(calls) == 0 {
		return nil
	}

	hasSerial := false
	for _, c := range calls {
		if c.Name == "update_chapter" {
			hasSerial = true
			break
		}
	}

	if hasSerial || len(calls) <= 1 {
		results := make([]toolResult, 0, len(calls))
		for _, c := range calls {
			results = append(results, r.executeSingleTool(c))
		}
		return results
	}

	results := make([]toolResult, len(calls))
	var wg sync.WaitGroup
	for i, c := range calls {
		wg.Add(1)
		go func(i int, c bookToolCall) {
			defer wg.Done()
			results[i] = r.executeSingleTool(c)
		}(i, c)
	}
	wg.Wait()
	return results
}

func (r *bookAgentRun) executeSingleTool(tc bookToolCall) toolResult {
	if tc.Name == "get_book_info" {
		if bid, _ := tc.Args["bookId"].(string); bid == "" && r.bookID != "" {
			if tc.Args == nil {
				tc.Args = map[string]any{}
			}
			tc.Args["bookId"] = r.bookID
		}
	}

	if len(tc.Args) == 0 {
		return toolResult{ID: tc.ID, Name: tc.Name, Content: fmt.Sprintf("工具 %s 的参数为空，已跳过。", tc.Name)}
	}

	result, err := r.invokeTool(tc.Name, tc.Args)
	if err != nil {
		result = "工具执行错误: " + err.Error()
	}
	return toolResult{ID: tc.ID, Name: tc.Name, Content: result}
}

func (r *bookAgentRun) invokeTool(name string, args map[string]any) (string, error) {
	switch name {
	case "get_book_info":
		return r.toolGetBookInfo(args)
	case "save_chapter":
		return r.toolSaveChapter(args)
	case "update_chapter":
		return r.toolUpdateChapter(args)
	case "route":
		return r.toolRoute(args)
	}
	return "未知工具: " + name, nil
}

type bookInfoChapter struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	WordCount int64  `json:"wordCount"`
	Order     int64  `json:"order"`
}

type bookInfoPayload struct {
	Title        string            `json:"title"`
	Description  string            `json:"description"`
	Tags         json.RawMessage   `json:"tags"`
	ChapterCount int               `json:"chapterCount"`
	VolumeCount  int               `json:"volumeCount"`
	Chapters     []bookInfoChapter `json:"chapters"`
}

func (r *bookAgentRun) toolGetBookInfo(args map[string]any) (string, error) {
	bookID, _ := args["bookId"].(string)
	book, err := db.GetBook(bookID)
	if err != nil {
		return "", err
	}
	if book == nil {
		return "未找到指定书籍", nil
	}
	chapters, err := db.GetChapterMetaByBookID(bookID)
	if err != nil {
		return "", err
	}
	volumes, err := db.GetVolumesByBookID(bookID)
	if err != nil {
		return "", err
	}

	items := make([]bookInfoChapter, 0, len(chapters))
	for _, c := range chapters {
		items = append(items, bookInfoChapter{ID: c.ID, Title: c.Title, WordCount: c.WordCount, Order: c.Order})
	}
	tags := book.Tags
	if len(tags) == 0 {
		tags = json.RawMessage("[]")
	}
	payload := bookInfoPayload{
		Title:        book.Title,
		Description:  book.Description,
		Tags:         tags,
		ChapterCount: len(chapters),
		VolumeCount:  len(volumes),
		Chapters:     items,
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(payload); err != nil {
		return "", err
	}
	return strings.TrimRight(buf.String(), "\n"), nil
}

func (r *bookAgentRun) toolSaveChapter(args map[string]any) (string, error) {
	bookID, _ := args["bookId"].(string)
	title, _ := args["title"].(string)
	content, _ := args["content"].(string)
	order := int64(0)
	if v, ok := args["order"]; ok {
		order = toInt64(v)
	}
	c := &db.Chapter{
		ID:        db.NewID(),
		BookID:    bookID,
		Title:     title,
		Content:   content,
		WordCount: int64(jsLen(content)),
		Order:     order,
		Metadata:  json.RawMessage("{}"),
	}
	if _, err := db.CreateChapter(c); err != nil {
		return "", err
	}
	return fmt.Sprintf("章节保存成功: %s (id: %s)", c.Title, c.ID), nil
}

func (r *bookAgentRun) toolUpdateChapter(args map[string]any) (string, error) {
	chapterID, _ := args["chapterId"].(string)
	updates := map[string]any{}
	if v, ok := args["content"]; ok {
		updates["content"] = toString(v)
	}
	if v, ok := args["title"]; ok {
		updates["title"] = toString(v)
	}
	chapter, err := db.UpdateChapter(chapterID, updates)
	if err != nil {
		return "", err
	}
	if chapter == nil {
		return "章节更新失败", nil
	}
	return fmt.Sprintf("章节更新成功: %s", chapter.Title), nil
}

func (r *bookAgentRun) toolRoute(args map[string]any) (string, error) {
	target, _ := args["target"].(string)
	r.pendingMu.Lock()
	r.pendingRoute = target
	r.pendingMu.Unlock()
	if target == "end" {
		return "流程已结束，所有工作已完成。", nil
	}
	return fmt.Sprintf("已切换到 %s，请继续执行。", target), nil
}

// ──────────────────── writer auto save ────────────────────

var (
	bookAgentTitleRe = regexp.MustCompile(`(?i)#?\s*第[一二三四五六七八九十0-9]+章\s*(.+)`)
	bookAgentPureRe  = regexp.MustCompile(`(?i)^#?\s*第[一二三四五六七八九十0-9]+章\s*.+\n+`)
)

func (r *bookAgentRun) autoSaveWriter(content string) {
	isRealContent := jsLen(content) > 100 &&
		!strings.Contains(content, "route(") &&
		!strings.Contains(content, "<｜｜DSML｜｜") &&
		!strings.Contains(content, "已收到") &&
		!strings.Contains(content, "现调度") &&
		!strings.Contains(content, "调度 editor") &&
		(strings.Contains(content, "# 第") || strings.Contains(content, "## 第") || strings.Contains(content, "\n\n"))
	if !isRealContent {
		return
	}

	title := fmt.Sprintf("第%d章", r.chapterOrder)
	if m := bookAgentTitleRe.FindStringSubmatch(content); m != nil {
		title = strings.TrimSpace(m[1])
	}
	pureContent := strings.TrimSpace(bookAgentPureRe.ReplaceAllString(content, ""))
	if jsLen(pureContent) <= 50 {
		return
	}

	if r.draftChapterID != "" {
		if _, err := db.UpdateChapter(r.draftChapterID, map[string]any{
			"title": title, "content": pureContent, "wordCount": int64(jsLen(pureContent)),
		}); err != nil {
			log.Printf("[auto-save] 草稿章节更新失败: %v", err)
		}
		return
	}

	created, err := db.CreateChapter(&db.Chapter{
		ID:        db.NewID(),
		BookID:    r.bookID,
		Title:     title,
		Content:   pureContent,
		WordCount: int64(jsLen(pureContent)),
		Order:     int64(r.chapterOrder),
		Metadata:  json.RawMessage("{}"),
	})
	if err != nil {
		log.Printf("[auto-save] 章节保存失败: %v", err)
		return
	}
	r.draftChapterID = created.ID
}

// ──────────────────── book info header ────────────────────

func (r *bookAgentRun) buildBookInfo() string {
	book, err := db.GetBook(r.bookID)
	if err != nil {
		return "获取书籍信息失败: " + err.Error()
	}
	if book == nil {
		return fmt.Sprintf("未找到书籍 (ID: %s)", r.bookID)
	}
	chapters, err := db.GetChapterMetaByBookID(r.bookID)
	if err != nil {
		return "获取书籍信息失败: " + err.Error()
	}

	desc := book.Description
	if desc == "" {
		desc = "无"
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "书籍标题: %s\n", book.Title)
	fmt.Fprintf(&sb, "简介: %s\n", desc)
	fmt.Fprintf(&sb, "已有章节: %d章\n", len(chapters))
	for i, c := range chapters {
		if i > 0 {
			sb.WriteString("\n")
		}
		fmt.Fprintf(&sb, "  - %s (%d字)", c.Title, c.WordCount)
	}
	return sb.String()
}

// ──────────────────── DB record ────────────────────

func (r *bookAgentRun) finish(status string) {
	raw, err := marshalNoHTML(r.conversation)
	if err != nil {
		raw = []byte("[]")
	}
	if _, err := db.UpdateBookAgent(r.recordID, map[string]any{"status": status, "messages": string(raw)}); err != nil {
		log.Printf("BookAgent 更新记录失败: %v", err)
	}
}

// ──────────────────── DSML / text parsing ────────────────────
