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

// ──────────────────── 提示词（逐字来自 promot/*.ts） ────────────────────

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
- consistency 返回检查结果 → 参考系统给出的“章节进度”：若还有未写章节，调用 route({ "target": "writer" }) 写下一章；若全部章节写完，调用 route({ "target": "end" })

## 重要
1. 每次只调用一个 route 工具，不要同时调用其他工具
2. 不要在回复中描述你要做什么，直接调用 route
3. 你的回复应该简短，例如："已收到，切换到下一阶段"
4. 一本书通常有多章，consistency 通过后应继续写下一章，直到大纲中所有章节完成才 end`

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
	bookAgentMaxStepCount      = 200
	bookAgentMaxNodeExecutions = 200
)

// BookAgentRequest 是 POST /api/book-agent 接受的 JSON 请求体。
type BookAgentRequest struct {
	Prompt    string `json:"prompt"`
	BookID    string `json:"bookId"`
	Model     string `json:"model"`
	BaseURL   string `json:"baseUrl"`
	APIKey    string `json:"apiKey"`
	RequestID string `json:"requestId"`
}

// RunBookAgent 对应 BookAgentRunner.run：由显式 route 工具驱动的多 Agent
// 写作工作流，并向客户端流式推送 SSE 事件。
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

// ──────────────────── 运行状态 ────────────────────

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

// agentHandoff 是 Agent 之间传递的结构化载荷（Trae 风格的上下文隔离）：
// 仅摘要呈现给 orchestrator，完整产出交给下游工作 Agent 消费。
type agentHandoff struct {
	From    string `json:"from"`
	Kind    string `json:"kind"`
	Summary string `json:"summary"`
	Output  string `json:"output"`
}

// bookAgentToolPermissions 是代码层的按角色工具白名单，取代仅靠提示词的
// “不要调用 X”约束（纵深防御）。
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

// outlineChapter 是从 thinker 大纲解析出的单个章节（标题 + 概要）。
type outlineChapter struct {
	Title   string
	Summary string
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

	// 章节游标（方案 A：显式章节循环）
	outlineChapters   []outlineChapter
	completedChapters int
	chapterID         string // 当前章节的数据库 id；新章创建后赋值，章完成后清空
	chapterReworked   bool   // 当前章节是否已返工过
	lastVerdict       string // 最近一次 consistency 的结论标记

	pendingRoute string
	pendingMu    sync.Mutex

	conversation []convMessage

	// Trae 风格扩展 ─────────────────────────────
	// historySummary 是扁平化的跨轮上下文（此前的用户输入 + Agent 回答），
	// 以单条 system 消息注入，而非共享完整对话记录。
	historySummary string
	// handoff 是最近一次 Agent 节点的结构化产出。
	handoff agentHandoff
	// lastDraft 保留最新的章节/编辑内容，供返工使用。
	lastDraft string
	// board 是按书籍持久化的共享黑板。
	board *db.BookAgentState

	// pendingToolMsg 保存待执行工具调用的 assistant 消息；pendingToolResults
	// 回传给同一个 Agent（ReAct 风格）。
	pendingToolMsg     *Message
	pendingToolResults []Message

	// consistency 节点的验证门禁状态。
	consistencyVerified bool
	consistencyRetries  int
}

func (r *bookAgentRun) run(ctx context.Context) {
	r.board = r.loadBoard()
	r.initConversation()
	r.historySummary = r.buildHistoryContext()
	r.currentPhase = "orchestrator"
	r.currentAgent = "orchestrator"
	r.stepCount = 0
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
		switch node {
		case "thinker":
			// 解析大纲章节目录，初始化章节游标。
			r.loadOutline(msg.Content)
		case "writer":
			// 新章则创建，返工/续写则更新当前章节。
			r.autoSaveWriter(msg.Content)
		case "editor":
			// 把润色后的正文写回当前章节。
			r.updateCurrentChapter(msg.Content)
		case "consistency":
			r.lastVerdict = r.consistencyVerdict(msg.Content)
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

// loadBoard 获取（或初始化）该书籍的共享黑板。
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

// captureHandoff 记录节点的结构化结果。orchestrator 仅接收 Summary；
// 下游工作节点接收完整的 Output。
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
	case "editor":
		r.lastDraft = content
	}
	r.handoff = agentHandoff{From: node, Kind: kind, Summary: summary, Output: content}
}

// ──────────────────── 章节循环（方案 A）────────────────────

// loadOutline 解析 thinker 的大纲为章节目录，并初始化章节游标。
func (r *bookAgentRun) loadOutline(outline string) {
	r.outlineChapters = parseOutlineChapters(outline)
	if len(r.outlineChapters) == 0 {
		// 解析失败时退化为单章，保证流程不中断。
		r.outlineChapters = []outlineChapter{{Title: "第1章"}}
	}
	r.completedChapters = 0
	r.chapterID = ""
	r.chapterReworked = false
	r.consistencyVerified = false
	r.consistencyRetries = 0
	r.lastVerdict = ""
}

// currentChapter 返回当前待写/正在写的章节，越界时返回兜底章节。
func (r *bookAgentRun) currentChapter() outlineChapter {
	idx := r.completedChapters
	if idx >= 0 && idx < len(r.outlineChapters) {
		return r.outlineChapters[idx]
	}
	return outlineChapter{Title: fmt.Sprintf("第%d章", idx+1)}
}

// hasMoreChapters 报告是否还有未完成章节。
func (r *bookAgentRun) hasMoreChapters() bool {
	return r.completedChapters < len(r.outlineChapters)
}

// startNextChapter 切换到下一章：清空当前章节 id 与验证状态，使下一章
// 由 autoSaveWriter 触发 CreateChapter。
func (r *bookAgentRun) startNextChapter() {
	r.chapterID = ""
	r.chapterReworked = false
	r.consistencyVerified = false
	r.consistencyRetries = 0
	r.lastVerdict = ""
}

// markChapterComplete 标记当前章节完成，并推进章节游标。
func (r *bookAgentRun) markChapterComplete() {
	ch := r.currentChapter()
	title := ch.Title
	if title == "" {
		title = fmt.Sprintf("第%d章", r.completedChapters+1)
	}
	r.appendProgress(fmt.Sprintf("第%d章 《%s》 完成", r.completedChapters+1, title))
	r.completedChapters++
	r.startNextChapter()
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

// consistencyVerdict 提取“结论: 通过 / 不通过 / 待检”标记。
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

// boardSummary 将黑板渲染为紧凑的 system 上下文。
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

// buildAgentMessages 为单个 Agent 节点构建全新隔离的上下文：
// system 提示词 + 跨轮历史摘要 + 黑板 + 本节点输入。
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

// buildNodeInput 渲染节点的任务/handoff 文本。orchestrator 只看摘要；
// 工作节点看到需要处理的上游完整产出。
func (r *bookAgentRun) buildNodeInput(node string) string {
	header := fmt.Sprintf("## 项目任务\n\n书籍ID: %s\n\n%s\n\n用户需求: %s",
		r.bookID, r.buildBookInfo(), r.prompt)

	if node == "orchestrator" {
		total := len(r.outlineChapters)
		progress := fmt.Sprintf("章节进度：已完成 %d/%d 章。", r.completedChapters, total)
		hint := "若还有未写章节，调用 route({ \"target\": \"writer\" })；若全部章节写完，调用 route({ \"target\": \"end\" })。"
		if total == 0 {
			hint = "首次启动请调用 route({ \"target\": \"thinker\" }) 生成大纲。"
		}
		return header + fmt.Sprintf(
			"\n\n上一环节: %s\n上一环节摘要:\n%s\n\n%s\n%s",
			r.handoff.From, r.handoff.Summary, progress, hint)
	}

	// 工作者节点：接收上游完整产物（上下文隔离下正文只在需要的节点出现）。
	var upstream string
	switch node {
	case "writer":
		if r.handoff.From == "consistency" && r.lastDraft != "" {
			upstream = "## 待修订正文\n\n" + r.lastDraft +
				"\n\n## 需要修正的一致性问题\n\n" + r.issuesText() +
				"\n\n请根据以上问题修订本章正文后调用 route 切换到 editor。"
		} else {
			ch := r.currentChapter()
			upstream = fmt.Sprintf(
				"## 全书大纲\n\n%s\n\n## 本次任务\n请撰写第 %d 章《%s》",
				r.board.Plan, r.completedChapters+1, ch.Title)
			if ch.Summary != "" {
				upstream += "\n本章概要：" + ch.Summary
			}
			upstream += "\n\n只输出本章正文（Markdown），不要输出其它章节，也不要输出调度/说明文字。完成后调用 route 切换到 editor。"
		}
	case "editor":
		upstream = fmt.Sprintf("## 上游正文（第 %d 章《%s》）\n\n%s\n\n请润色后输出完整章节正文，并调用 route 切换到 consistency。",
			r.completedChapters+1, r.currentChapter().Title, r.handoff.Output)
	case "consistency":
		upstream = fmt.Sprintf("## 上游待检查内容（第 %d 章）\n\n%s", r.completedChapters+1, r.handoff.Output) +
			"\n\n请先调用 get_book_info 获取真实章节数据，再检查一致性并调用 route 切换到 orchestrator。"
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

// buildHistoryContext 将该书籍更早的记录（此前的用户输入 + Agent 回答）
// 扁平化为单个紧凑的摘要字符串。
func (r *bookAgentRun) buildHistoryContext() string {
	records, err := db.GetBookAgentsByBookID(r.bookID) // 按 createdAt 倒序
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

// ──────────────────── 对话持久化 ────────────────────

const (
	bookAgentHistoryMaxMessages = 40
	bookAgentHistoryMaxChars    = 3000
)

// initConversation 为本次用户输入创建新记录。用户输入存于 Title，
// Agent 回答累积在 Messages，Status 记录结果（done/error/cancelled）。
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

// buildHistoryContext 定义在上方运行循环附近（返回摘要字符串，
// 而非共享的 []Message 对话记录）。

// saveMessages 将整个对话写回 bookAgent 记录。
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

// runAgent 以隔离上下文执行单个 Agent 节点：节点获得全新的消息列表
// （system 提示词 + 历史摘要 + 黑板 + 本节点输入），而非共享完整对话记录
// （Trae 风格隔离）。
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

// collectToolCalls 合并模型返回的标准工具调用、DSML 编码解析结果，
// 以及最后手段的纯文本启发式解析。
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

// ──────────────────── 路由调度 ────────────────────

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
			r.clearPendingRoute()
			return "consistency"
		}
		// 结论为“不通过”且尚未返工 → 退回 writer 重写当前章。
		if r.lastVerdict == "不通过" && !r.chapterReworked {
			r.chapterReworked = true
			r.clearPendingRoute()
			return "writer"
		}
		// 本章通过：推进章节游标。
		r.markChapterComplete()
	}

	r.pendingMu.Lock()
	target := r.pendingRoute
	r.pendingRoute = ""
	r.pendingMu.Unlock()

	if target == "writer" && r.currentPhase == "orchestrator" {
		// orchestrator 决定写下一章：若无剩余章节则结束。
		if !r.hasMoreChapters() {
			return bookAgentEnd
		}
		r.startNextChapter()
		return "writer"
	}

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

func (r *bookAgentRun) clearPendingRoute() {
	r.pendingMu.Lock()
	r.pendingRoute = ""
	r.pendingMu.Unlock()
}

// ──────────────────── 工具执行 ────────────────────

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

// ──────────────────── 章节解析与保存 ────────────────────

var (
	bookAgentChapterHeadingRe = regexp.MustCompile(`^\s*#{1,4}\s*第[0-9一二三四五六七八九十百零两]+\s*[章回节][\s:：]*(.*)$`)
	bookAgentSummaryRe        = regexp.MustCompile(`^\s*[-*]?\s*概要[\s:：]*(.*)$`)
)

// parseOutlineChapters 从大纲文本中提取章节标题与概要。
func parseOutlineChapters(outline string) []outlineChapter {
	var chapters []outlineChapter
	for _, line := range strings.Split(outline, "\n") {
		if m := bookAgentChapterHeadingRe.FindStringSubmatch(line); m != nil {
			chapters = append(chapters, outlineChapter{Title: strings.TrimSpace(m[1])})
			continue
		}
		if len(chapters) > 0 {
			if m := bookAgentSummaryRe.FindStringSubmatch(line); m != nil {
				chapters[len(chapters)-1].Summary = strings.TrimSpace(m[1])
			}
		}
	}
	return chapters
}

// stripChapterHeading 去掉正文开头重复的“# 第X章 标题”行。
func stripChapterHeading(content string) string {
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if bookAgentChapterHeadingRe.MatchString(line) {
			return strings.TrimSpace(strings.Join(lines[i+1:], "\n"))
		}
		break
	}
	return strings.TrimSpace(content)
}

// isRealChapterContent 粗略判断是否为真正的章节正文（而非调度/工具文本）。
func isRealChapterContent(content string) bool {
	return jsLen(content) > 100 &&
		!strings.Contains(content, "route(") &&
		!strings.Contains(content, "<｜｜DSML｜｜") &&
		!strings.Contains(content, "已收到") &&
		!strings.Contains(content, "现调度") &&
		!strings.Contains(content, "调度 editor")
}

// autoSaveWriter 保存 writer 产出：新章创建，返工/续写则更新当前章节。
func (r *bookAgentRun) autoSaveWriter(content string) {
	if !isRealChapterContent(content) {
		return
	}
	ch := r.currentChapter()
	title := strings.TrimSpace(ch.Title)
	if title == "" {
		title = fmt.Sprintf("第%d章", r.completedChapters+1)
	}
	pureContent := stripChapterHeading(content)
	if jsLen(pureContent) <= 50 {
		return
	}

	if r.chapterID != "" {
		// 返工或续写：更新同一条章节。
		if _, err := db.UpdateChapter(r.chapterID, map[string]any{
			"title": title, "content": pureContent, "wordCount": int64(jsLen(pureContent)),
		}); err != nil {
			log.Printf("[auto-save] 章节更新失败: %v", err)
		}
		return
	}

	created, err := db.CreateChapter(&db.Chapter{
		ID:        db.NewID(),
		BookID:    r.bookID,
		Title:     title,
		Content:   pureContent,
		WordCount: int64(jsLen(pureContent)),
		Order:     int64(r.completedChapters + 1),
		Metadata:  json.RawMessage("{}"),
	})
	if err != nil {
		log.Printf("[auto-save] 章节创建失败: %v", err)
		return
	}
	r.chapterID = created.ID
}

// updateCurrentChapter 用 editor 润色后的正文更新当前章节。
func (r *bookAgentRun) updateCurrentChapter(content string) {
	if r.chapterID == "" {
		return
	}
	pureContent := stripChapterHeading(content)
	if jsLen(pureContent) <= 50 {
		return
	}
	ch := r.currentChapter()
	title := strings.TrimSpace(ch.Title)
	if title == "" {
		title = fmt.Sprintf("第%d章", r.completedChapters+1)
	}
	if _, err := db.UpdateChapter(r.chapterID, map[string]any{
		"title": title, "content": pureContent, "wordCount": int64(jsLen(pureContent)),
	}); err != nil {
		log.Printf("[auto-save] 编辑后章节更新失败: %v", err)
	}
}

// ──────────────────── 书籍信息头部 ────────────────────

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

// ──────────────────── 数据库记录 ────────────────────

func (r *bookAgentRun) finish(status string) {
	r.saveMessages()
	if _, err := db.UpdateBookAgent(r.recordID, map[string]any{"status": status}); err != nil {
		log.Printf("BookAgent 更新记录失败: %v", err)
	}
}
