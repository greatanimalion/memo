package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"log"
	"regexp"
	"slices"
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
	bookAgentCancelText = "任务已取消"
	bookAgentEnd        = "__end__"
	// 一次运行可能包含多个 Agent 节点与工具轮次：按每章约 5 次模型调用、
	// 10 次循环迭代估算，30 章需要约 300 次调用，因此上限留足余量。
	bookAgentMaxStepCount      = 400
	bookAgentMaxNodeExecutions = 800
	// 防死循环兜底：单章内同一节点最多执行次数，以及连续无进展轮次上限。
	bookAgentMaxNodeCallsPerChapter = 8
	bookAgentMaxStalledCalls        = 12
	// bookAgentMaxToolResultChars 限制单个工具结果进入上下文的长度。
	bookAgentMaxToolResultChars = 12_000
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
	"thinker":      {"route": true, "get_book_info": true, "get_chapter": true},
	"writer":       {"route": true, "get_book_info": true, "get_chapter": true, "save_chapter": true, "update_chapter": true},
	"editor":       {"route": true, "get_book_info": true, "get_chapter": true, "update_chapter": true},
	"consistency":  {"route": true, "get_book_info": true, "get_chapter": true},
}

func bookAgentToolAllowed(role, tool string) bool {
	perms, ok := bookAgentToolPermissions[role]
	if !ok {
		return false
	}
	return perms[tool]
}

// ──────────────────── 原生工具声明 ────────────────────

// bookAgentToolsForRole 返回该角色可用的 OpenAI function 工具声明。
// 把这些声明真正随请求发送（而不是只在提示词里描述），模型即可使用原生
// function calling；DSML / 纯文本解析仅作为不支持工具调用时的回退。
func bookAgentToolsForRole(role string) []Tool {
	defs := map[string]Tool{
		"route": bookAgentRouteTool(),
		"get_book_info": FuncTool("get_book_info", "获取书籍信息与已保存章节列表（不含正文）", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"bookId": map[string]any{"type": "string", "description": "书籍 ID，省略时使用当前书籍"},
			},
		}),
		"get_chapter": FuncTool("get_chapter", "读取指定章节的完整正文；省略 chapterId 时返回当前书籍最后一章", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"chapterId": map[string]any{"type": "string", "description": "章节 ID"},
				"bookId":    map[string]any{"type": "string", "description": "书籍 ID，省略时使用当前书籍"},
			},
		}),
		"save_chapter": FuncTool("save_chapter", "新建章节并保存正文", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"bookId":  map[string]any{"type": "string", "description": "书籍 ID"},
				"title":   map[string]any{"type": "string", "description": "章节标题"},
				"content": map[string]any{"type": "string", "description": "章节正文（Markdown）"},
				"order":   map[string]any{"type": "number", "description": "章节序号"},
			},
			"required": []string{"bookId", "title", "content"},
		}),
		"update_chapter": FuncTool("update_chapter", "更新已有章节的标题或正文", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"chapterId": map[string]any{"type": "string", "description": "章节 ID"},
				"title":     map[string]any{"type": "string", "description": "新标题"},
				"content":   map[string]any{"type": "string", "description": "新正文（Markdown）"},
			},
			"required": []string{"chapterId"},
		}),
	}

	allowed := bookAgentToolPermissions[role]
	out := make([]Tool, 0, len(allowed))
	// 固定顺序，保证每次请求体稳定、便于服务端缓存。
	for _, name := range []string{"route", "get_book_info", "get_chapter", "save_chapter", "update_chapter"} {
		if allowed[name] {
			out = append(out, defs[name])
		}
	}
	return out
}

func bookAgentRouteTool() Tool {
	return FuncTool("route", "切换流程到下一个 Agent。一次只调用一个 route。", map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target": map[string]any{
				"type":        "string",
				"description": "目标 Agent 或 end",
				"enum":        []string{"orchestrator", "thinker", "writer", "editor", "consistency", "end"},
			},
		},
		"required": []string{"target"},
	})
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
	chapterOffset     int    // 本次运行开始前书籍已有的最大章节序号
	completedChapters int    // 本次运行中已完成的章节数
	chapterID         string // 当前章节的数据库 id；新章创建后赋值，章完成后清空
	reworkPending     bool   // 当前章节是否已返工过
	writerRetries     int    // 当前章节 writer 未产出正文时的重试次数
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
	// lastDraft 保留最近一次成功写入数据库的章节正文，供返工/编辑/检查使用；
	// lastDraftCursor 记录它属于哪个章节（等于当时的 completedChapters）。
	lastDraft       string
	lastDraftCursor int
	// board 是按书籍持久化的共享黑板。
	board *db.BookAgentState

	// pendingToolMsg 保存待执行工具调用的 assistant 消息；pendingToolResults
	// 回传给同一个 Agent（ReAct 风格）。
	pendingToolMsg     *Message
	pendingToolResults []Message

	// consistency 节点的验证门禁状态。
	consistencyVerified bool
	consistencyRetries  int

	// outputTruncated 表示本轮模型输出因长度上限被截断，此时不应保存
	// 残缺章节，也不应执行参数可能被截断的工具调用。
	outputTruncated bool
	// noNativeTools 在服务端不支持 function calling 后置位，后续节点回退
	// 到仅靠提示词 + DSML/文本解析的兼容模式。
	noNativeTools bool

	// 防死循环：本章内各节点的调用次数、进度指纹与连续无进展计数。
	nodeCalls       map[string]int
	lastProgressKey string
	stalledCalls    int
}

func (r *bookAgentRun) run(ctx context.Context) {
	r.board = r.loadBoard()
	r.initConversation()
	r.historySummary = r.buildHistoryContext()
	if maxOrder, err := db.GetMaxChapterOrder(r.bookID); err == nil && maxOrder > 0 {
		r.chapterOffset = int(maxOrder)
	}
	r.currentPhase = "orchestrator"
	r.currentAgent = "orchestrator"
	r.stepCount = 0
	r.handoff = agentHandoff{From: "user", Kind: "task", Summary: r.prompt, Output: r.prompt}

	node := "orchestrator"
	status := "done"
	exhausted := true

	for iterations := 0; iterations < bookAgentMaxNodeExecutions; iterations++ {
		if ctx.Err() != nil {
			status = "cancelled"
			r.sse.Write("cancel", bookAgentCancelText)
			exhausted = false
			break
		}
		// 循环顶部统一检查模型调用上限，工具回放分支也无法绕过。
		if r.stepCount >= bookAgentMaxStepCount {
			status = "error"
			r.sse.Write("error", "写作流程超过最大模型调用次数，已停止")
			exhausted = false
			break
		}

		if node == "tools" {
			results := r.executeTools()
			for _, res := range results {
				// consistency 必须真正读取过书籍数据才允许下结论。
				if r.currentAgent == "consistency" && res.Name == "get_book_info" &&
					!strings.HasPrefix(res.Content, "工具执行错误") {
					r.consistencyVerified = true
				}
				r.sse.Write("tool", jsonPayload(toolResultEvent{Name: res.Name, Result: res.Content}))
				r.conversation = append(r.conversation, convMessage{
					Agent:     r.currentAgent,
					Role:      "tool",
					Content:   fmt.Sprintf("[%s] %s", res.Name, clipText(res.Content, 2000)),
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
			// 工具轮也计入无进展检测：避免模型反复调用工具却不推进章节。
			if !r.trackStall() {
				status = "error"
				r.sse.Write("error", "写作流程长时间没有进展，已停止")
				exhausted = false
				break
			}
			// 若本轮工具调用里包含 route，直接按路由跳转，不再用工具回执
			// 重跑当前 Agent（回执会覆盖正文、大纲与结论，导致丢章/误判）。
			if r.hasPendingRoute() {
				r.pendingToolMsg = nil
				r.pendingToolResults = nil
				next := r.routePhase()
				if next == bookAgentEnd {
					exhausted = false
					break
				}
				node = next
				continue
			}
			// 否则回到发起工具的 agent（ReAct），让它消费工具结果后继续。
			node = r.currentAgent
			continue
		}

		r.currentAgent = node
		// 单章内同一节点执行次数上限，防止节点自我循环。
		if !r.enterNode(node) {
			status = "error"
			r.sse.Write("error", fmt.Sprintf("节点 %s 在本章执行次数超过上限，已停止", node))
			exhausted = false
			break
		}
		msg, err := r.runAgent(ctx, node)
		if err != nil {
			exhausted = false
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
			switch {
			case r.hasToolCall(msg, "save_chapter", "update_chapter"):
				// 由工具负责持久化，跳过自动保存以免重复建章。
			case r.outputTruncated:
				r.noteTruncatedOutput("writer")
			default:
				r.autoSaveWriter(msg.Content)
			}
		case "editor":
			switch {
			case r.hasCurrentChapterUpdate(msg):
				// update_chapter 已写回当前章节。
			case r.outputTruncated:
				r.noteTruncatedOutput("editor")
			default:
				r.updateCurrentChapter(msg.Content)
			}
		case "consistency":
			r.lastVerdict = r.consistencyVerdict(msg.Content)
			r.recordIssues(msg.Content)
		}

		if hasValidBookToolCalls(msg) {
			r.pendingToolMsg = msg
			node = "tools"
			continue
		}
		// 无工具轮：按进度指纹检测空转，连续无进展则中止。
		if !r.trackStall() {
			status = "error"
			r.sse.Write("error", "写作流程长时间没有进展，已停止")
			exhausted = false
			break
		}
		next := r.routePhase()
		if next == bookAgentEnd {
			exhausted = false
			break
		}
		node = next
	}

	if exhausted && status == "done" {
		status = "error"
		r.sse.Write("error", "写作流程超过最大执行次数，已停止")
	}
	if status == "done" {
		r.sse.Write("done", doneEventText)
	}
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
	content = strings.TrimSpace(content)
	if content == "" {
		return
	}
	kind := node
	if node == "orchestrator" {
		kind = "dispatch"
	}
	summary := content
	if len([]rune(summary)) > 400 {
		summary = string([]rune(summary)[:400]) + "..."
	}
	// 各角色的结构化产物写进黑板，供后续节点/轮次共享。
	if node == "thinker" {
		r.board.Plan = content
		r.persistBoard()
	}
	r.handoff = agentHandoff{From: node, Kind: kind, Summary: summary, Output: content}
}

// ──────────────────── 章节循环（方案 A）────────────────────

// loadOutline 解析 thinker 的大纲为章节目录，并初始化章节游标。
func (r *bookAgentRun) loadOutline(outline string) {
	parsed := parseOutlineChapters(outline)
	switch {
	case len(parsed) > 0:
		r.outlineChapters = parsed
		r.completedChapters = 0
	case len(r.outlineChapters) == 0:
		// 解析失败且没有既有大纲时退化为单章，保证流程不中断。
		r.outlineChapters = []outlineChapter{{Title: "第1章"}}
		r.completedChapters = 0
	}
	// 若已有大纲且本次解析为空，保留原大纲与进度，避免重跑 thinker 清零。
	r.chapterID = ""
	r.reworkPending = false
	r.writerRetries = 0
	r.consistencyVerified = false
	r.consistencyRetries = 0
	r.lastVerdict = ""
	r.nodeCalls = map[string]int{}
}

// chapterNumber 返回当前章节在整本书中的序号（含运行前已有章节）。
func (r *bookAgentRun) chapterNumber() int {
	return r.chapterOffset + r.completedChapters + 1
}

// currentChapter 返回当前待写/正在写的章节，越界时返回兜底章节。
func (r *bookAgentRun) currentChapter() outlineChapter {
	idx := r.completedChapters
	if idx >= 0 && idx < len(r.outlineChapters) {
		return r.outlineChapters[idx]
	}
	return outlineChapter{Title: fmt.Sprintf("第%d章", r.chapterNumber())}
}

// hasMoreChapters 报告是否还有未完成章节。
func (r *bookAgentRun) hasMoreChapters() bool {
	return r.completedChapters < len(r.outlineChapters)
}

// startNextChapter 切换到下一章：清空当前章节 id 与验证状态，使下一章
// 由 autoSaveWriter / save_chapter 触发 CreateChapter。
func (r *bookAgentRun) startNextChapter() {
	r.chapterID = ""
	r.reworkPending = false
	r.writerRetries = 0
	r.consistencyVerified = false
	r.consistencyRetries = 0
	r.lastVerdict = ""
	r.nodeCalls = map[string]int{}
}

// setLastDraft 记录最近一次成功落库的正文及其章节归属。
func (r *bookAgentRun) setLastDraft(content string) {
	if strings.TrimSpace(content) == "" {
		return
	}
	r.lastDraft = content
	r.lastDraftCursor = r.completedChapters
}

// currentDraft 返回当前章节已落库的正文；属于其它章节时返回空。
func (r *bookAgentRun) currentDraft() string {
	if r.lastDraftCursor != r.completedChapters {
		return ""
	}
	return r.lastDraft
}

// markChapterComplete 标记当前章节完成，并推进章节游标。
func (r *bookAgentRun) markChapterComplete() {
	ch := r.currentChapter()
	title := ch.Title
	if title == "" {
		title = fmt.Sprintf("第%d章", r.chapterNumber())
	}
	r.appendProgress(fmt.Sprintf("第%d章 《%s》 完成", r.chapterNumber(), title))
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

// recordIssueText 把一条问题写入黑板（去重）。
func (r *bookAgentRun) recordIssueText(text string) {
	if r.board == nil || text == "" {
		return
	}
	var issues []string
	if err := json.Unmarshal(r.board.Issues, &issues); err != nil {
		issues = nil
	}
	if slices.Contains(issues, text) {
		return
	}
	issues = append(issues, text)
	raw, _ := json.Marshal(issues)
	r.board.Issues = raw
	r.persistBoard()
}

func (r *bookAgentRun) recordIssues(content string) {
	// 依据结构化结论标记判断是否通过，避免报告模板里的"未通过项"字样误触发。
	if r.consistencyVerdict(content) != "不通过" {
		return
	}
	summary := content
	if len([]rune(summary)) > 300 {
		summary = string([]rune(summary)[:300]) + "..."
	}
	r.recordIssueText(summary)
}

// noteTruncatedOutput 记录并提示某节点的输出被长度上限截断，避免把残缺
// 章节静默写入数据库。
func (r *bookAgentRun) noteTruncatedOutput(node string) {
	msg := fmt.Sprintf("%s 的输出达到长度上限而被截断，本轮未保存章节。建议缩短单章篇幅后重试。", node)
	r.sse.Write("message", "\n\n["+msg+"]\n")
	r.recordIssueText(msg)
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
	return trimMessages(msgs, maxAgentInputTokens)
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
		draft := r.currentDraft()
		if r.reworkPending && draft != "" {
			upstream = "## 待修订正文\n\n" + draft +
				"\n\n## 需要修正的一致性问题\n\n" + r.issuesText() +
				"\n\n请根据以上问题修订本章正文后调用 route 切换到 editor。"
		} else {
			ch := r.currentChapter()
			upstream = fmt.Sprintf(
				"## 全书大纲\n\n%s\n\n## 本次任务\n请撰写第 %d 章《%s》",
				r.board.Plan, r.chapterNumber(), ch.Title)
			if ch.Summary != "" {
				upstream += "\n本章概要：" + ch.Summary
			}
			if previous := r.previousChapterContext(); previous != "" {
				upstream = previous + "\n\n" + upstream
			}
			upstream += "\n\n只输出本章正文（Markdown），不要输出其它章节，也不要输出调度/说明文字。完成后调用 route 切换到 editor。"
		}
	case "editor":
		draft := r.currentDraft()
		if draft == "" {
			draft = r.handoff.Output
		}
		upstream = fmt.Sprintf("## 上游正文（第 %d 章《%s》）\n\n%s\n\n请润色后输出完整章节正文，并调用 route 切换到 consistency。",
			r.chapterNumber(), r.currentChapter().Title, draft)
	case "consistency":
		draft := r.currentDraft()
		if draft == "" {
			draft = r.handoff.Output
		}
		upstream = fmt.Sprintf("## 上游待检查内容（第 %d 章）\n\n%s", r.chapterNumber(), draft) +
			"\n\n请先调用 get_book_info 获取章节列表，必要时用 get_chapter 读取前文，再检查一致性并调用 route 切换到 orchestrator。"
		if previous := r.previousChapterContext(); previous != "" {
			upstream = previous + "\n\n" + upstream
		}
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

	r.outputTruncated = false
	// 真正把该角色可用的工具声明发送给模型，启用原生 function calling；
	// 若服务端不支持，下面的 collectToolCalls 仍会解析 DSML / 纯文本回退。
	emitDelta := func(fragment string) {
		if fragment == "" || ctx.Err() != nil {
			return
		}
		r.sse.Write("message", fragment)
	}

	var tools []Tool
	if !r.noNativeTools {
		tools = bookAgentToolsForRole(node)
	}
	msg, err := r.client.Stream(ctx, msgs, tools, emitDelta)
	if err != nil && len(tools) > 0 && IsToolsUnsupported(err) {
		// 兼容不支持 function calling 的模型：去掉 tools 重试一次，并记住
		// 该模式，避免后续每个节点都先失败一次。
		r.noNativeTools = true
		msg, err = r.client.Stream(ctx, msgs, nil, emitDelta)
	}
	if err != nil && IsContextLengthExceeded(err) {
		// 上下文超限：强制压缩本节点输入（优先保留尾部任务/工具结果）后重试。
		msgs = trimMessages(msgs, maxAgentInputTokens/3)
		msg, err = r.client.Stream(ctx, msgs, tools, emitDelta)
	}
	if err != nil {
		return nil, err
	}
	r.outputTruncated = msg.FinishReason == FinishLength

	fullContent := msg.Content
	calls := []bookToolCall{}
	if !r.outputTruncated {
		calls = r.collectToolCalls(msg, fullContent)
	}

	// 所有工具调用都进入 out.ToolCalls，由 executeSingleTool 做白名单校验
	// 并返回拒绝结果，这样模型能收到反馈并自行纠正（而不是被静默丢弃）。
	out := &Message{Role: "assistant", Content: fullContent, FinishReason: msg.FinishReason}
	for _, c := range calls {
		r.sse.Write("tool_call", jsonPayload(bookAgentToolCallEvent{Agent: node, Name: c.Name}))
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

// hasValidBookToolCalls 报告模型是否请求了工具。注意：不带参数的工具
// （如 get_book_info、get_chapter）同样是有效调用，不能因参数为空而忽略。
func hasValidBookToolCalls(msg *Message) bool {
	return len(msg.ToolCalls) > 0
}

// hasToolCall 报告 msg 是否包含当前 Agent 有权调用的指定工具。
func (r *bookAgentRun) hasToolCall(msg *Message, names ...string) bool {
	for _, tc := range msg.ToolCalls {
		if !bookAgentToolAllowed(r.currentAgent, tc.Function.Name) {
			continue
		}
		if slices.Contains(names, tc.Function.Name) {
			return true
		}
	}
	return false
}

// hasCurrentChapterUpdate 报告 editor 是否已用 update_chapter 直接更新当前章。
func (r *bookAgentRun) hasCurrentChapterUpdate(msg *Message) bool {
	for _, tc := range msg.ToolCalls {
		if tc.Function.Name != "update_chapter" || !bookAgentToolAllowed(r.currentAgent, tc.Function.Name) {
			continue
		}
		args := map[string]any{}
		if tc.Function.Arguments != "" {
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
		}
		id, _ := args["chapterId"].(string)
		if id == "" || id == r.chapterID {
			return true
		}
	}
	return false
}

// hasPendingRoute 报告是否有待处理的 route 目标（加锁读取）。
func (r *bookAgentRun) hasPendingRoute() bool {
	r.pendingMu.Lock()
	defer r.pendingMu.Unlock()
	return r.pendingRoute != ""
}

// bookAgentRouteTransitions 限定显式 route 的合法跳转，防止模型在节点之间
// 互相跳转形成死循环；end 永远允许。
var bookAgentRouteTransitions = map[string]map[string]bool{
	"orchestrator": {"thinker": true, "writer": true},
	"thinker":      {"writer": true, "orchestrator": true},
	"writer":       {"editor": true},
	"editor":       {"consistency": true},
	"consistency":  {"orchestrator": true, "writer": true},
}

func bookAgentRouteAllowed(from, to string) bool {
	if to == "end" {
		return true
	}
	return bookAgentRouteTransitions[from][to]
}

// progressKey 是流程进度的指纹：章节游标、当前章节 id、大纲长度与正文内容。
func (r *bookAgentRun) progressKey() string {
	return fmt.Sprintf("%d|%s|%d|%d|%d",
		r.completedChapters, r.chapterID, len(r.outlineChapters),
		r.lastDraftCursor, crc32.ChecksumIEEE([]byte(r.lastDraft)))
}

// trackStall 在每次节点/工具轮结束后记录进度；连续无进展达到上限返回 false。
func (r *bookAgentRun) trackStall() bool {
	key := r.progressKey()
	if key != r.lastProgressKey {
		r.lastProgressKey = key
		r.stalledCalls = 0
		return true
	}
	r.stalledCalls++
	return r.stalledCalls < bookAgentMaxStalledCalls
}

// enterNode 检查并记录节点在本章内的执行次数；超出预算返回 false。
func (r *bookAgentRun) enterNode(node string) bool {
	if r.nodeCalls == nil {
		r.nodeCalls = map[string]int{}
	}
	if r.nodeCalls[node] >= bookAgentMaxNodeCallsPerChapter {
		return false
	}
	r.nodeCalls[node]++
	return true
}

func (r *bookAgentRun) routePhase() string {
	// 验证门禁与结论处理：consistency 必须先调用 get_book_info 拿到真实
	// 章节数据，否则退回重检（模仿 Trae reviewer「必须跑 bash 才能下结论」）。
	if r.currentPhase == "consistency" {
		if !r.consistencyVerified && r.consistencyRetries < 2 {
			r.consistencyRetries++
			r.clearPendingRoute()
			return "consistency"
		}
		switch r.lastVerdict {
		case "待检":
			if r.consistencyRetries < 2 {
				r.consistencyRetries++
				r.clearPendingRoute()
				return "consistency"
			}
			// 重检后仍待检：记录问题但按通过处理，避免流程停滞。
			r.recordIssueText("consistency 连续返回待检，已按通过处理但未完成真实校验")
			r.markChapterComplete()
		case "不通过":
			if !r.reworkPending {
				// 退回 writer 重写当前章，保留章节 id 以便更新同一行。
				r.reworkPending = true
				r.clearPendingRoute()
				return "writer"
			}
			// 返工后仍不通过：保留当前版本并记录问题，避免死循环。
			r.recordIssueText("返工后 consistency 仍判定不通过，已保留当前版本")
			r.markChapterComplete()
		case "通过":
			r.markChapterComplete()
		default:
			// 没有结论标记：重检；重检仍无结论则按通过处理并记录问题。
			if r.consistencyRetries < 2 {
				r.consistencyRetries++
				r.clearPendingRoute()
				return "consistency"
			}
			r.recordIssueText("consistency 未输出结论标记，已按通过处理")
			r.markChapterComplete()
		}
	}

	r.pendingMu.Lock()
	target := r.pendingRoute
	r.pendingRoute = ""
	r.pendingMu.Unlock()

	// 拒绝非法跳转（例如 editor -> editor、writer -> orchestrator），
	// 交由下方按阶段兜底，避免节点间互相跳转形成死循环。
	if target != "" && !bookAgentRouteAllowed(r.currentPhase, target) {
		log.Printf("BookAgent 非法路由 %s -> %s，已忽略", r.currentPhase, target)
		target = ""
	}

	// writer 未成功落库章节却请求离开（或没有 route）：重试一次，避免
	// 空章节进入编辑/检查流程造成“幽灵完成”。
	if r.currentPhase == "writer" && r.chapterID == "" && r.writerRetries < 1 &&
		(target == "" || target == "editor" || target == "consistency") {
		r.writerRetries++
		return "writer"
	}

	if target == "writer" {
		if r.currentPhase == "orchestrator" {
			// orchestrator 决定写下一章：若无剩余章节则结束。
			if !r.hasMoreChapters() {
				return bookAgentEnd
			}
			r.startNextChapter()
			return "writer"
		}
		// 其它节点请求 writer：没有大纲先构思，没有剩余章节则结束。
		if len(r.outlineChapters) == 0 {
			return "thinker"
		}
		if !r.hasMoreChapters() {
			return bookAgentEnd
		}
		return "writer"
	}

	if target != "" {
		if target == "end" {
			return bookAgentEnd
		}
		return target
	}

	// 模型没有调用 route：按阶段兜底。绝不能默认回 thinker（会重置大纲）。
	switch r.currentPhase {
	case "orchestrator":
		if len(r.outlineChapters) == 0 {
			return "thinker"
		}
		if r.hasMoreChapters() {
			return "writer"
		}
		return bookAgentEnd
	case "thinker":
		return "orchestrator"
	case "writer":
		return "editor"
	case "editor":
		return "consistency"
	case "consistency":
		return "orchestrator"
	default:
		return bookAgentEnd
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

	// 写章节的工具必须串行执行：它们共享 r.chapterID / lastDraft 状态。
	hasSerial := false
	for _, c := range calls {
		if c.Name == "update_chapter" || c.Name == "save_chapter" {
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
	// 代码层白名单：未授权调用返回拒绝结果给模型（而非静默丢弃）。
	if !bookAgentToolAllowed(r.currentAgent, tc.Name) {
		log.Printf("BookAgent 工具 %s 未授权给 %s，已拒绝", tc.Name, r.currentAgent)
		return toolResult{
			ID:   tc.ID,
			Name: tc.Name,
			Content: fmt.Sprintf("工具 %s 未授权给 %s，请改用允许的工具或直接调用 route。",
				tc.Name, r.currentAgent),
		}
	}
	if tc.Name == "get_book_info" {
		if bid, _ := tc.Args["bookId"].(string); bid == "" && r.bookID != "" {
			if tc.Args == nil {
				tc.Args = map[string]any{}
			}
			tc.Args["bookId"] = r.bookID
		}
	}

	result, err := r.invokeToolSafely(tc.Name, tc.Args)
	if err != nil {
		result = "工具执行错误: " + err.Error()
	}
	return toolResult{ID: tc.ID, Name: tc.Name, Content: clipText(result, bookAgentMaxToolResultChars)}
}

// invokeToolSafely 执行工具并把 panic 转为错误，防止单个工具导致整个写书
// 流程崩溃。
func (r *bookAgentRun) invokeToolSafely(name string, args map[string]any) (result string, err error) {
	defer func() {
		if rec := recover(); rec != nil {
			result, err = "", fmt.Errorf("工具 %s panic: %v", name, rec)
		}
	}()
	return r.invokeTool(name, args)
}

func (r *bookAgentRun) invokeTool(name string, args map[string]any) (string, error) {
	switch name {
	case "get_book_info":
		return r.toolGetBookInfo(args)
	case "get_chapter":
		return r.toolGetChapter(args)
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

// toolGetChapter 读取指定章节正文；省略 chapterId 时返回当前书籍最后一章。
// 这让 writer / consistency 能访问真实正文，而不是只看元数据。
func (r *bookAgentRun) toolGetChapter(args map[string]any) (string, error) {
	chapterID, _ := args["chapterId"].(string)
	if chapterID != "" {
		chapter, err := db.GetChapter(chapterID)
		if err != nil {
			return "", err
		}
		if chapter == nil {
			return "未找到指定章节", nil
		}
		return formatChapterForAgent(chapter), nil
	}

	bookID, _ := args["bookId"].(string)
	if bookID == "" {
		bookID = r.bookID
	}
	chapter, err := db.GetLastChapterByBookID(bookID)
	if err != nil {
		return "", err
	}
	if chapter == nil {
		return "该书暂无已保存章节", nil
	}
	return formatChapterForAgent(chapter), nil
}

func formatChapterForAgent(chapter *db.Chapter) string {
	if chapter == nil {
		return "未找到章节"
	}
	return fmt.Sprintf("# %s\n\n%s", chapter.Title, clipText(chapter.Content, bookAgentMaxToolResultChars))
}

// previousChapterContext 返回上一章末尾片段，用于让新章节自然承接前文。
// 只读取上一章一行，避免随章节增多而反复载入整本书的正文。
func (r *bookAgentRun) previousChapterContext() string {
	order := r.chapterNumber() - 1
	if order <= 0 {
		return ""
	}
	previous, err := db.GetChapterByOrder(r.bookID, int64(order))
	if err != nil || previous == nil || isBlank(previous.Content) {
		return ""
	}
	return fmt.Sprintf("## 上一章《%s》结尾（承接用）\n\n%s", previous.Title, tailText(previous.Content, 1200))
}

func (r *bookAgentRun) toolSaveChapter(args map[string]any) (string, error) {
	bookID, _ := args["bookId"].(string)
	if bookID == "" {
		bookID = r.bookID
	}
	if bookID == "" {
		return "保存失败：缺少 bookId", nil
	}
	title := strings.TrimSpace(toString(args["title"]))
	content := stripChapterHeading(toString(args["content"]))
	if strings.TrimSpace(content) == "" {
		return "保存失败：章节内容为空", nil
	}
	order := int64(0)
	if v, ok := args["order"]; ok {
		order = toInt64(v)
	}
	if order <= 0 {
		order = int64(r.chapterNumber())
	}
	if title == "" {
		title = fmt.Sprintf("第%d章", order)
	}

	// 当前章节已存在（返工/续写）时更新同一行，避免重复建章。
	if r.chapterID != "" {
		chapter, err := db.UpdateChapter(r.chapterID, map[string]any{
			"title": title, "content": content, "wordCount": int64(jsLen(content)),
		})
		if err != nil {
			return "", err
		}
		if chapter == nil {
			return "章节更新失败", nil
		}
		r.setLastDraft(content)
		return fmt.Sprintf("章节更新成功: %s (id: %s)", chapter.Title, chapter.ID), nil
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
	r.chapterID = c.ID
	r.setLastDraft(content)
	return fmt.Sprintf("章节保存成功: %s (id: %s)", c.Title, c.ID), nil
}

func (r *bookAgentRun) toolUpdateChapter(args map[string]any) (string, error) {
	chapterID, _ := args["chapterId"].(string)
	if chapterID == "" {
		chapterID = r.chapterID
	}
	if chapterID == "" {
		return "章节更新失败：缺少 chapterId，且当前没有正在处理的章节", nil
	}
	updates := map[string]any{}
	if v, ok := args["content"]; ok {
		content := stripChapterHeading(toString(v))
		updates["content"] = content
		updates["wordCount"] = int64(jsLen(content))
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
	if chapterID == r.chapterID {
		if content, ok := updates["content"].(string); ok {
			r.setLastDraft(content)
		}
	}
	return fmt.Sprintf("章节更新成功: %s", chapter.Title), nil
}

func (r *bookAgentRun) toolRoute(args map[string]any) (string, error) {
	target, _ := args["target"].(string)
	switch target {
	case "orchestrator", "thinker", "writer", "editor", "consistency", "end":
	default:
		return "", fmt.Errorf("未知的 route 目标 %q", target)
	}
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
	// 兼容 Markdown 标题、加粗、列表前缀与无 # 的纯文本章节行，
	// 例如 "### 第一章: 开端"、"**第1章 开端**"、"- 第2章、冲突"。
	bookAgentChapterHeadingRe = regexp.MustCompile(`^\s*(?:[-*+]\s*)?(?:#{1,6}\s*)?(?:\*\*)?\s*第\s*[0-9一二三四五六七八九十百千零两]+\s*[章回节]\s*(?:[：:、.．]\s*)?(?:\*\*)?\s*(.*)$`)
	bookAgentSummaryRe        = regexp.MustCompile(`^\s*[-*+]?\s*(?:\*\*)?\s*(?:概要|简介|内容)\s*(?:\*\*)?\s*[：:、]?\s*(.*)$`)
)

// parseOutlineChapters 从大纲文本中提取章节标题与概要。
func parseOutlineChapters(outline string) []outlineChapter {
	var chapters []outlineChapter
	for _, line := range strings.Split(outline, "\n") {
		if m := bookAgentChapterHeadingRe.FindStringSubmatch(line); m != nil {
			title := strings.TrimSpace(m[1])
			title = strings.TrimSpace(strings.TrimSuffix(title, "**"))
			chapters = append(chapters, outlineChapter{Title: title})
			continue
		}
		if len(chapters) > 0 {
			if m := bookAgentSummaryRe.FindStringSubmatch(line); m != nil {
				summary := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(m[1]), "**"))
				chapters[len(chapters)-1].Summary = summary
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
// 只拦截明显的调度痕迹，避免正文中正常出现的“已收到”等词误伤。
func isRealChapterContent(content string) bool {
	trimmed := strings.TrimSpace(content)
	if jsLen(trimmed) <= 100 {
		return false
	}
	return !strings.Contains(trimmed, "route(") &&
		!strings.Contains(trimmed, "<｜｜DSML｜｜")
}

// autoSaveWriter 保存 writer 产出：新章创建，返工/续写则更新当前章节。
func (r *bookAgentRun) autoSaveWriter(content string) {
	if !isRealChapterContent(content) {
		return
	}
	ch := r.currentChapter()
	title := strings.TrimSpace(ch.Title)
	if title == "" {
		title = fmt.Sprintf("第%d章", r.chapterNumber())
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
			return
		}
		r.setLastDraft(pureContent)
		return
	}

	created, err := db.CreateChapter(&db.Chapter{
		ID:        db.NewID(),
		BookID:    r.bookID,
		Title:     title,
		Content:   pureContent,
		WordCount: int64(jsLen(pureContent)),
		Order:     int64(r.chapterNumber()),
		Metadata:  json.RawMessage("{}"),
	})
	if err != nil {
		log.Printf("[auto-save] 章节创建失败: %v", err)
		return
	}
	r.chapterID = created.ID
	r.setLastDraft(pureContent)
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
		title = fmt.Sprintf("第%d章", r.chapterNumber())
	}
	if _, err := db.UpdateChapter(r.chapterID, map[string]any{
		"title": title, "content": pureContent, "wordCount": int64(jsLen(pureContent)),
	}); err != nil {
		log.Printf("[auto-save] 编辑后章节更新失败: %v", err)
		return
	}
	r.setLastDraft(pureContent)
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
