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
- 未通过项（没有则写"无"）
- 总结建议

最后必须单独输出一行结论标记（供系统解析）：
- 全部通过时输出：结论: 通过
- 存在问题需要修改时输出：结论: 不通过
- 尚未读取真实章节数据时输出：结论: 待检

## 重要规则
1. 检查前**必须先调用 get_book_info** 获取真实书籍与章节数据（系统会据此校验），然后再输出报告
2. 输出完整报告后，**必须**调用 route 工具：
   route({ "target": "orchestrator" })
3. 不要调用 save_chapter、update_chapter
4. 检查要客观准确
5. 矛盾描述要具体

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

// agentHandoff is the structured payload passed between agents (Trae-style
// context isolation): only the summary is surfaced to the orchestrator, the
// full output is handed to the downstream worker that consumes it.
type agentHandoff struct {
	From    string `json:"from"`
	Kind    string `json:"kind"`
	Summary string `json:"summary"`
	Output  string `json:"output"`
}

// bookAgentToolPermissions is the code level allow list per role. It replaces
// the "do not call X" prompt-only constraints (defence in depth).
var bookAgentToolPermissions = map[string]map[string]bool{
	"orchestrator": {"route": true},
	"thinker":      {"route": true, "get_book_info": true},
	"writer":       {"route": true, "get_book_info": true, "save_chapter": true, "update_chapter": true},
	"editor":       {"route": true, "get_book_info": true, "update_chapter": true},
	"consistency":  {"route": true, "get_book_info": true},
}

func bookAgentToolAllowed(role, tool string) bool {
	perms, ok := bookAgentToolPermissions[role]
	if !ok {
		return false
	}
	return perms[tool]
}

type bookAgentRun struct {
	client *Client
	sse    Emitter
	prompt string
	bookID string

	recordID     string
	currentPhase string
	currentAgent string
	stepCount    int
	chapterOrder int

	draftChapterID string

	pendingRoute string
	pendingMu    sync.Mutex

	conversation []convMessage

	// Trae-style additions ─────────────────────────────
	// historySummary is the flattened cross-round context (previous user inputs
	// + agent answers) injected as one system message instead of the whole
	// shared transcript.
	historySummary string
	// handoff is the structured output of the most recent agent node.
	handoff agentHandoff
	// lastDraft keeps the latest chapter/edited content for rework.
	lastDraft string
	// board is the shared blackboard persisted per book.
	board *db.BookAgentState

	// pendingToolMsg holds the assistant message whose tool calls are about to
	// run; pendingToolResults are fed back to the same agent (ReAct style).
	pendingToolMsg     *Message
	pendingToolResults []Message

	// verification gate state for the consistency node.
	consistencyVerified bool
	consistencyRetries  int
	reworkCount         int
}

func (r *bookAgentRun) run(ctx context.Context) {
	r.board = r.loadBoard()
	r.initConversation()
	r.historySummary = r.buildHistoryContext()
	r.currentPhase = "orchestrator"
	r.currentAgent = "orchestrator"
	r.stepCount = 0
	r.chapterOrder = 1
	r.handoff = agentHandoff{From: "user", Kind: "task", Summary: r.prompt, Output: r.prompt}

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
				r.pendingToolResults = append(r.pendingToolResults, Message{
					Role:       "tool",
					Content:    res.Content,
					ToolCallID: res.ID,
					Name:       res.Name,
				})
			}
			r.saveMessages()
			// 工具执行后回到发起工具的 agent（ReAct），由其决定是否 route。
			node = r.currentAgent
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
		// 记录结构化 handoff（上下文隔离：默认只透传摘要，正文留在本节点）。
		r.captureHandoff(node, msg.Content)
		if node == "writer" {
			r.autoSaveWriter(msg.Content)
			r.chapterOrder++
		}
		if node == "consistency" {
			r.recordIssues(msg.Content)
		}

		if hasValidBookToolCalls(msg) {
			r.pendingToolMsg = msg
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

// loadBoard fetches (or initialises) the shared blackboard for the book.
func (r *bookAgentRun) loadBoard() *db.BookAgentState {
	board, err := db.GetBookAgentState(r.bookID)
	if err != nil {
		log.Printf("BookAgent 读取共享状态失败: %v", err)
	}
	if board == nil {
		board = &db.BookAgentState{
			BookID:   r.bookID,
			Plan:     "",
			Progress: json.RawMessage("[]"),
			Issues:   json.RawMessage("[]"),
		}
	}
	return board
}

// captureHandoff records the structured result of a node. The orchestrator only
// ever receives Summary; downstream workers receive the full Output.
func (r *bookAgentRun) captureHandoff(node, content string) {
	kind := node
	if node == "orchestrator" {
		kind = "dispatch"
	}
	summary := content
	if len([]rune(summary)) > 400 {
		summary = string([]rune(summary)[:400]) + "..."
	}
	// 各角色的结构化产物写进黑板，供后续节点/轮次共享。
	switch node {
	case "thinker":
		r.board.Plan = content
		r.persistBoard()
	case "writer":
		r.lastDraft = content
		if r.handoff.From != "consistency" {
			r.appendProgress(fmt.Sprintf("第%d章 已写", r.chapterOrder))
		}
	case "editor":
		r.lastDraft = content
	}
	r.handoff = agentHandoff{From: node, Kind: kind, Summary: summary, Output: content}
}

func (r *bookAgentRun) appendProgress(item string) {
	if r.board == nil {
		return
	}
	var items []string
	if err := json.Unmarshal(r.board.Progress, &items); err != nil {
		items = nil
	}
	items = append(items, item)
	raw, _ := json.Marshal(items)
	r.board.Progress = raw
	r.persistBoard()
}

func (r *bookAgentRun) recordIssues(content string) {
	if r.board == nil {
		return
	}
	// 依据结构化结论标记判断是否通过，避免报告模板里的"未通过项"字样误触发。
	if r.consistencyVerdict(content) != "不通过" {
		return
	}
	var issues []string
	if err := json.Unmarshal(r.board.Issues, &issues); err != nil {
		issues = nil
	}
	summary := content
	if len([]rune(summary)) > 300 {
		summary = string([]rune(summary)[:300]) + "..."
	}
	issues = append(issues, summary)
	raw, _ := json.Marshal(issues)
	r.board.Issues = raw
	r.persistBoard()
}

// consistencyVerdict extracts the "结论: 通过 / 不通过 / 待检" marker.
func (r *bookAgentRun) consistencyVerdict(content string) string {
	switch {
	case strings.Contains(content, "结论: 不通过"), strings.Contains(content, "结论：不通过"):
		return "不通过"
	case strings.Contains(content, "结论: 待检"), strings.Contains(content, "结论：待检"):
		return "待检"
	case strings.Contains(content, "结论: 通过"), strings.Contains(content, "结论：通过"):
		return "通过"
	}
	return ""
}

func (r *bookAgentRun) persistBoard() {
	if r.board == nil {
		return
	}
	if _, err := db.UpsertBookAgentState(r.board); err != nil {
		log.Printf("BookAgent 保存共享状态失败: %v", err)
	}
}

// boardSummary renders the blackboard as a compact system context.
func (r *bookAgentRun) boardSummary() string {
	if r.board == nil {
		return ""
	}
	var sb strings.Builder
	if r.board.Plan != "" {
		plan := r.board.Plan
		if len([]rune(plan)) > 1200 {
			plan = string([]rune(plan)[:1200]) + "..."
		}
		fmt.Fprintf(&sb, "### 已定大纲\n%s\n", plan)
	}
	var progress []string
	if err := json.Unmarshal(r.board.Progress, &progress); err == nil && len(progress) > 0 {
		fmt.Fprintf(&sb, "### 写作进度\n%s\n", strings.Join(progress, "、"))
	}
	var issues []string
	if err := json.Unmarshal(r.board.Issues, &issues); err == nil && len(issues) > 0 {
		fmt.Fprintf(&sb, "### 待处理一致性问题\n%s\n", strings.Join(issues, "\n"))
	}
	return strings.TrimSpace(sb.String())
}

// buildAgentMessages builds a fresh, isolated context for one agent node:
// system prompt + cross-round history summary + blackboard + this node's input.
func (r *bookAgentRun) buildAgentMessages(node string) []Message {
	prompt, ok := bookAgentPrompts[node]
	if !ok {
		prompt = bookAgentPrompts["orchestrator"]
	}

	msgs := make([]Message, 0, 6)
	msgs = append(msgs, Message{Role: "system", Content: prompt})

	if r.historySummary != "" {
		msgs = append(msgs, Message{
			Role:    "system",
			Content: "## 历史对话摘要\n" + r.historySummary,
		})
	}
	if summary := r.boardSummary(); summary != "" {
		msgs = append(msgs, Message{
			Role:    "system",
			Content: "## 项目共享状态\n" + summary,
		})
	}

	msgs = append(msgs, Message{Role: "user", Content: r.buildNodeInput(node)})
	// 工具结果只回传给发起工具的同一个 agent（隔离，不外泄）。
	// OpenAI 协议要求 role=tool 的消息必须紧跟在带 tool_calls 的 assistant
	// 消息之后，因此这里先回放该 assistant 消息再追加工具结果。
	if r.pendingToolMsg != nil {
		msgs = append(msgs, *r.pendingToolMsg)
	}
	msgs = append(msgs, r.pendingToolResults...)
	return msgs
}

// buildNodeInput renders the task/handoff text for a node. Orchestrator sees
// only summaries; workers see the upstream full output they must act on.
func (r *bookAgentRun) buildNodeInput(node string) string {
	header := fmt.Sprintf("## 项目任务\n\n书籍ID: %s\n\n%s\n\n用户需求: %s",
		r.bookID, r.buildBookInfo(), r.prompt)

	if node == "orchestrator" {
		return header + fmt.Sprintf(
			"\n\n上一环节: %s\n上一环节摘要:\n%s\n\n请根据以上信息决定下一步，并只调用 route 工具。",
			r.handoff.From, r.handoff.Summary)
	}

	// 工作者节点：接收上游完整产物（上下文隔离下正文只在需要的节点出现）。
	var upstream string
	switch node {
	case "writer":
		if r.handoff.From == "consistency" && r.lastDraft != "" {
			upstream = "## 待修订正文\n\n" + r.lastDraft +
				"\n\n## 需要修正的一致性问题\n\n" + r.issuesText() +
				"\n\n请根据以上问题修订正文后调用 route 切换到 editor。"
		} else {
			upstream = "## 上游大纲（来自 thinker）\n\n" + r.handoff.Output
		}
	case "editor":
		upstream = "## 上游正文（来自 writer）\n\n" + r.handoff.Output
	case "consistency":
		upstream = "## 上游待检查内容（来自 editor）\n\n" + r.handoff.Output +
			"\n\n请先调用 get_book_info 获取真实章节数据，再检查一致性。"
	case "thinker":
		upstream = "## 用户需求\n\n" + r.prompt
	}
	return header + "\n\n" + upstream
}

func (r *bookAgentRun) issuesText() string {
	if r.board == nil {
		return ""
	}
	var issues []string
	if err := json.Unmarshal(r.board.Issues, &issues); err != nil {
		return ""
	}
	return strings.Join(issues, "\n")
}

// buildHistoryContext flattens the book's earlier records (previous user inputs
// + agent answers) into a single compact summary string.
func (r *bookAgentRun) buildHistoryContext() string {
	records, err := db.GetBookAgentsByBookID(r.bookID) // DESC by createdAt
	if err != nil {
		return ""
	}
	history := make([]convMessage, 0)
	for i := len(records) - 1; i >= 0; i-- {
		rec := records[i]
		if rec.ID == r.recordID {
			continue
		}
		if rec.Title != "" {
			history = append(history, convMessage{Agent: "user", Role: "user", Content: rec.Title})
		}
		var msgs []convMessage
		if err := json.Unmarshal(rec.Messages, &msgs); err == nil {
			history = append(history, msgs...)
		}
	}
	if len(history) > bookAgentHistoryMaxMessages {
		history = history[len(history)-bookAgentHistoryMaxMessages:]
	}
	var sb strings.Builder
	for _, m := range history {
		if m.Role != "user" && m.Role != "assistant" {
			continue
		}
		label := "用户"
		if m.Role == "assistant" && m.Agent != "" && m.Agent != "user" {
			label = m.Agent
		}
		content := m.Content
		if len([]rune(content)) > bookAgentHistoryMaxChars {
			content = string([]rune(content)[:bookAgentHistoryMaxChars]) + "..."
		}
		fmt.Fprintf(&sb, "[%s] %s\n", label, content)
	}
	return strings.TrimSpace(sb.String())
}

// ──────────────────── conversation persistence ────────────────────

const (
	bookAgentHistoryMaxMessages = 40
	bookAgentHistoryMaxChars    = 3000
)

// initConversation creates a fresh record for this user input. The user input
// is stored in Title, agent answers are accumulated in Messages, and Status
// tracks the outcome (done/error/cancelled).
func (r *bookAgentRun) initConversation() {
	r.recordID = db.NewID()
	r.conversation = nil
	_, _ = db.CreateBookAgent(&db.BookAgent{
		ID:       r.recordID,
		BookID:   r.bookID,
		Title:    r.prompt,
		Messages: json.RawMessage("[]"),
		Status:   "running",
	})
	r.sse.Write("user_message", jsonPayload(convMessage{
		Agent:     "user",
		Role:      "user",
		Content:   r.prompt,
		Timestamp: time.Now().UnixMilli(),
	}))
}

// buildHistoryContext is defined near the run loop above (returns a summary
// string rather than a shared []Message transcript).

// saveMessages writes the whole conversation back to the bookAgent record.
func (r *bookAgentRun) saveMessages() {
	if r.recordID == "" {
		return
	}
	raw, err := marshalNoHTML(r.conversation)
	if err != nil {
		raw = []byte("[]")
	}
	if _, err := db.UpdateBookAgent(r.recordID, map[string]any{"messages": string(raw)}); err != nil {
		log.Printf("BookAgent 保存对话失败: %v", err)
	}
}

// runAgent executes one agent node with an isolated context: the node gets its
// own fresh message list (system prompt + history summary + blackboard + this
// node's input) instead of the whole shared transcript (Trae-style isolation).
func (r *bookAgentRun) runAgent(ctx context.Context, node string) (*Message, error) {
	msgs := r.buildAgentMessages(node)
	// 工具回放只使用一次，避免污染下一次节点上下文。
	r.pendingToolMsg = nil
	r.pendingToolResults = nil

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

	// 代码层工具白名单：未授权工具直接丢弃并告知模型。
	allowed := make([]bookToolCall, 0, len(calls))
	for _, c := range calls {
		if bookAgentToolAllowed(node, c.Name) {
			allowed = append(allowed, c)
			r.sse.Write("tool_call", jsonPayload(bookAgentToolCallEvent{Agent: node, Name: c.Name}))
			continue
		}
		log.Printf("BookAgent 工具 %s 未授权给 %s，已忽略", c.Name, node)
		r.sse.Write("tool", jsonPayload(toolResultEvent{
			Name:   c.Name,
			Result: fmt.Sprintf("工具 %s 未授权给 %s，请改用允许的工具或直接调用 route。", c.Name, node),
		}))
	}

	out := &Message{Role: "assistant", Content: fullContent}
	for _, c := range allowed {
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
		r.saveMessages()
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

	// 验证门禁：consistency 必须先调用 get_book_info 拿到真实章节数据，
	// 否则退回重检（模仿 Trae reviewer「必须跑 bash 才能下结论」）。
	if r.currentPhase == "consistency" {
		if !r.consistencyVerified && r.consistencyRetries < 1 {
			r.consistencyRetries++
			r.pendingMu.Lock()
			r.pendingRoute = ""
			r.pendingMu.Unlock()
			return "consistency"
		}
		if r.hasOpenIssues() && r.reworkCount < 1 {
			r.reworkCount++
			r.pendingMu.Lock()
			r.pendingRoute = ""
			r.pendingMu.Unlock()
			return "writer"
		}
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

// hasOpenIssues reports whether the consistency check recorded unresolved
// issues on the blackboard.
func (r *bookAgentRun) hasOpenIssues() bool {
	if r.board == nil {
		return false
	}
	var issues []string
	if err := json.Unmarshal(r.board.Issues, &issues); err != nil {
		return false
	}
	return len(issues) > 0
}

// ──────────────────── tool execution ────────────────────

func (r *bookAgentRun) executeTools() []toolResult {
	if r.pendingToolMsg == nil {
		return nil
	}
	calls := parseMessageToolCalls(*r.pendingToolMsg)
	if len(calls) == 0 {
		r.pendingToolMsg = nil
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
		// 验证门禁：consistency 读取真实数据后才允许下结论。
		if r.currentAgent == "consistency" {
			r.consistencyVerified = true
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
	r.saveMessages()
	if _, err := db.UpdateBookAgent(r.recordID, map[string]any{"status": status}); err != nil {
		log.Printf("BookAgent 更新记录失败: %v", err)
	}
}
