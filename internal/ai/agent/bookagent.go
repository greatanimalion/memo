package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"log"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"memo/internal/ai/config"
	"memo/internal/ai/llm"
	"memo/internal/ai/memory"
	"memo/internal/ai/tools"
	"memo/internal/db"
)

// ──────────────────── 提示词（逐字来自 promot/*.ts） ────────────────────

const bookAgentOrchestratorPrompt = `你是图书项目的总调度员（主 Agent）。

## 核心职责
你的唯一职责是**调度流程**：根据系统给出的“当前状态”和“下一步建议”，调用 route 工具。
你不构思内容、不写作、不编辑，也不直接操作台账。

## 调度目标
- architect：冻结全书章位，标注每章功能槽位与情节需求
- character：按需为本章出场的主要角色收集决策包
- writer：把章纲与决策包渲染成正文
- guard：定稿前校验正文与台账的一致性
- end：全部章节完成

## 重要
1. 每次只调用一个 route 工具，不要同时调用其他工具。
2. 不要在回复中描述你要做什么，直接调用 route。
3. 系统会按“当前状态”做兜底纠偏，但请尽量选择正确目标。`

const bookAgentArchitectPrompt = `你是总纲规划 Agent（Architect）。

## 职责
冻结全书章位，定义每章的核心事件与功能需求。你不写正文，也不决定角色具体变化如何执行。

## 输出
先输出简洁大纲，然后输出一个 JSON 代码块，结构如下：

{
  "core": "一句话核心",
  "synopsis": "200-300字梗概",
  "characters": [
    {"name": "姓名", "importance": "main", "profile": "性格、外貌、基础状态"}
  ],
  "chapters": [
    {
      "title": "章节标题",
      "summary": "本章核心事件，2-3句",
      "characters": ["本章出场的主要角色姓名"],
      "slots": ["功能槽位，例如：需要一个犯错被杀的配角"],
      "location": "主要地点",
      "narrativeTime": "本章叙事时间点，例如：第三天黄昏",
      "foreshadow": "本章埋下的伏笔，没有则留空",
      "resolveForeshadow": "本章回收的伏笔，没有则留空"
    }
  ]
}

## 规则
1. 主要角色必须给出 name 与 profile；次要角色标 support。
2. 需要临时配角时，不要直接给姓名，写进 slots，由轻量档案生成器填充。
3. 小说 15-30 章，非虚构 8-15 章。
4. 输出完成后调用 route({ "target": "character" })；若本章不需要角色决策，可直接 route({ "target": "writer" })。`

const bookAgentCharacterPrompt = `你是角色决策 Agent（Character Agent），只代表一个角色。

## 职责
基于系统提供的分层记忆，判断该角色在本章节点会怎么做、说什么、内心状态如何，以及是否发生状态变化。

## 分层记忆（系统按顺序提供）
1. 你的变化轨迹（基础档案 + 历史变化事件）
2. 你近期经历的事件
3. 当前场景地点状态与在场角色
4. 本章章纲需求

## 核心约束：变化必须有触发事件
只有台账中已发生的事件支持时，才能发生性格、外貌、能力、状态变化。
禁止因为“本章需要他变”而改变。没有可引用的触发事件时，changes 必须为空数组。

## 输出
只输出一个 JSON 对象：
{
  "character": "角色名",
  "decision": "本章该角色的核心决策",
  "actions": ["具体行动"],
  "dialogue": ["关键台词"],
  "innerState": "内心状态",
  "changes": [
    {"field": "性格/外貌/能力/状态", "oldValue": "旧值", "newValue": "新值", "reason": "变化原因", "triggerEvent": "触发事件ID或事件摘要"}
  ]
}`

const bookAgentWriterPrompt = `你是写作 Agent（Writer）。

## 职责
只负责把章纲、角色决策包和台账上下文渲染成连贯正文。
你不决定人物该不该变化，也不新增未登记的主要角色。

## 输入
- 全书大纲与本章章纲
- 各角色的决策包（行动、台词、内心状态）
- 台账中的角色当前状态、地点状态、未回收伏笔
- 上一章结尾

## 要求
1. 角色行为必须与决策包和台账状态一致，不得与当前状态矛盾。
2. 功能槽位配角使用台账中已生成的档案，不要自行另起名字。
3. 不要输出调度信息、解释或“我将……”。
4. 只输出本章正文（Markdown），至少 800 字。
5. 完成后调用 route({ "target": "guard" })。`

const bookAgentGuardPrompt = `你是连续性守卫（Guard）。

## 职责
定稿前校验正文与结构化台账的一致性，发现矛盾必须阻断。

## 校验范围
- 角色行为是否与当前状态、变化轨迹、决策包一致
- 地点描写是否与地点状态一致
- 伏笔是否按计划推进（系统会给出超期预警）
- 时间线、因果是否自洽

## 输出
先输出检查报告（检查范围、通过项、未通过项、建议），最后单独输出一行结论标记：
- 全部通过：结论: 通过
- 存在矛盾：结论: 不通过

## 规则
1. 不得自行修改正文，也不得调用写作工具。
2. 矛盾必须具体到人物/地点/事件。
3. 输出报告后调用 route({ "target": "orchestrator" })。`

var bookAgentPrompts = map[string]string{
	"orchestrator": bookAgentOrchestratorPrompt,
	"architect":    bookAgentArchitectPrompt,
	"character":    bookAgentCharacterPrompt,
	"writer":       bookAgentWriterPrompt,
	"guard":        bookAgentGuardPrompt,
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
	// Writer 连续未产出正文的最大轮次：超过后直接结束本轮运行，
	// 避免 writer ↔ guard 互相兜底跳转直到节点调用上限。
	bookAgentMaxWriterMisses = 2
	// Writer 单章内连续只调用工具、不回正文的最大轮次。
	bookAgentMaxWriterToolRounds = 3
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
		memory.RegisterAbort(req.RequestID, cancel)
		defer memory.UnregisterAbort(req.RequestID)
	}

	run := &bookAgentRun{
		client: llm.NewClient(config.ResolveRequest(req.Model, req.BaseURL), req.APIKey, "", 0.7),
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
	"architect":    {"route": true, "get_book_info": true},
	"character":    {"route": true, "get_book_info": true, "get_chapter": true},
	"writer":       {"route": true, "get_book_info": true, "get_chapter": true, "save_chapter": true, "update_chapter": true},
	"guard":        {"route": true, "get_book_info": true, "get_chapter": true},
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
// 工具声明与 schema 统一由 booktools.go 的 newBookToolRegistry 提供，
// 这里只按既有的角色白名单（bookAgentToolPermissions）过滤。
func bookAgentToolsForRole(role string) []llm.Tool {
	all := newBookToolRegistry(nil).Declarations()
	out := make([]llm.Tool, 0, len(all))
	for _, tool := range all {
		if bookAgentToolAllowed(role, tool.Function.Name) {
			out = append(out, tool)
		}
	}
	return out
}

// outlineChapter 是从 Architect 章纲解析出的单个章节。
type outlineChapter struct {
	Title             string
	Summary           string
	Characters        []string
	Slots             []string
	Location          string
	NarrativeTime     string
	Foreshadow        string
	ResolveForeshadow string
}

type bookAgentRun struct {
	// client 依赖 llm.StreamingLLM 抽象而非具体实现，便于替换与测试。
	// 原实现为 *llm.Client，保留备查。
	// client *llm.Client
	client llm.StreamingLLM
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
	lastVerdict       string // 最近一次 Guard 的结论标记

	// 结构化台账与按需激活
	characterProfiles map[string]architectCharacter // Architect 给出的角色基础档案
	castQueue         []castMember                  // 本章待执行的角色 Agent 队列
	castPrepared      bool                          // 本章是否已完成角色激活
	decisionPacks     map[string]string             // 角色名 → 决策包原文
	chapterBitPlayers []string                      // 本章功能槽位生成的临时配角 id
	chapterFinalized  bool                          // 本章是否已定稿写回台账

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
	// toolsReg 是本运行实例的工具注册表（工具声明 + 绑定运行态的执行函数）。
	toolsReg *tools.Registry

	// pendingToolMsg 保存待执行工具调用的 assistant 消息；pendingToolResults
	// 回传给同一个 Agent（ReAct 风格）。
	pendingToolMsg     *llm.Message
	pendingToolResults []llm.Message

	// guard 节点的重试计数。
	guardRetries int

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
	// writerMisses 记录本章 Writer 连续未落库正文的轮次；
	// toolRounds 记录当前节点的连续工具回放轮次。
	writerMisses int
	toolRounds   int
	// writerNudge 在 Writer 上一轮未产出正文时置位，下一次调用追加纠正指令。
	writerNudge bool
	// aborted 表示调度层已主动输出错误并终止，避免再补发 done 事件。
	aborted bool
}

func (r *bookAgentRun) run(ctx context.Context) {
	r.board = r.loadBoard()
	r.toolsReg = newBookToolRegistry(r)
	r.characterProfiles = map[string]architectCharacter{}
	r.decisionPacks = map[string]string{}
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
				r.sse.Write("tool", jsonPayload(toolResultEvent{Agent: r.currentAgent, Name: res.Name, Result: res.Content}))
				r.conversation = append(r.conversation, convMessage{
					Agent:     r.currentAgent,
					Role:      "tool",
					Content:   fmt.Sprintf("[%s] %s", res.Name, clipText(res.Content, 2000)),
					Timestamp: time.Now().UnixMilli(),
				})
				r.pendingToolResults = append(r.pendingToolResults, llm.Message{
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
			// Writer 连续多轮只调用工具（如反复 get_book_info）却不产出正文时，
			// 提前结束并给出明确原因，避免耗尽节点调用上限后才报出难懂的错误。
			r.toolRounds++
			if r.currentAgent == "writer" && r.currentDraft() == "" && !r.hasPendingRoute() &&
				r.toolRounds >= bookAgentMaxWriterToolRounds {
				r.abortRun(fmt.Sprintf("Writer 连续 %d 轮只调用工具、未产出正文（第%d章），已停止；已完成章节已保存，请重试",
					r.toolRounds, r.chapterNumber()))
				status = "error"
				exhausted = false
				break
			}
			// 若本轮工具调用里包含 route，直接按路由跳转，不再用工具回执
			// 重跑当前 Agent（回执会覆盖正文、大纲与结论，导致丢章/误判）。
			if r.hasPendingRoute() {
				r.pendingToolMsg = nil
				r.pendingToolResults = nil
				next := r.routePhase()
				r.toolRounds = 0
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

		// cast 是调度层的确定性节点：按章纲激活本章角色 Agent，
		// 并为功能槽位生成轻量配角档案。它不调用模型。
		if node == "cast" {
			r.prepareChapterCast(ctx)
			if len(r.castQueue) > 0 {
				node = "character"
			} else {
				node = "writer"
			}
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
		case "architect":
			// 解析章纲与角色基础档案，初始化章节游标。
			r.applyArchitectPlan(msg.Content)
		case "character":
			// 收集当前角色的决策包，队列前进一位。
			if len(r.castQueue) > 0 {
				name := r.castQueue[0].Name
				r.decisionPacks[name] = msg.Content
				r.castQueue = r.castQueue[1:]
			}
		case "writer":
			switch {
			case r.hasToolCall(msg, "save_chapter", "update_chapter"):
				// 由工具负责持久化，跳过自动保存以免重复建章。
			case r.outputTruncated:
				r.noteTruncatedOutput("writer")
			default:
				r.autoSaveWriter(msg.Content)
			}
			// 记录本章 Writer 是否产出正文；连续未产出时给下一次调用追加纠正指令。
			if r.currentDraft() == "" {
				r.writerMisses++
				r.writerNudge = true
			} else {
				r.writerMisses = 0
				r.writerNudge = false
			}
		case "guard":
			r.lastVerdict = r.guardVerdict(msg.Content)
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
		r.toolRounds = 0
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
	// 调度层已主动输出终止原因时不再补发 done，保持错误语义一致。
	if r.aborted && status == "done" {
		status = "error"
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
	if node == "architect" {
		r.board.Plan = content
		r.persistBoard()
	}
	r.handoff = agentHandoff{From: node, Kind: kind, Summary: summary, Output: content}
}

// ──────────────────── 章节循环（方案 A）────────────────────

// loadOutline 解析 Markdown 章节目录（Architect 结构化解析失败时的回退路径），
// 并初始化章节游标。
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
	// 若已有大纲且本次解析为空，保留原大纲与进度，避免重跑规划清零。
	r.resetChapterState()
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
	r.resetChapterState()
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
	if r.guardVerdict(content) != "不通过" {
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

// guardVerdict 提取“结论: 通过 / 不通过 / 待检”标记。
func (r *bookAgentRun) guardVerdict(content string) string {
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
func (r *bookAgentRun) buildAgentMessages(node string) []llm.Message {
	prompt, ok := bookAgentPrompts[node]
	if !ok {
		prompt = bookAgentPrompts["orchestrator"]
	}

	msgs := make([]llm.Message, 0, 6)
	msgs = append(msgs, llm.Message{Role: "system", Content: prompt})

	if r.historySummary != "" {
		msgs = append(msgs, llm.Message{
			Role:    "system",
			Content: "## 历史对话摘要\n" + r.historySummary,
		})
	}
	if summary := r.boardSummary(); summary != "" {
		msgs = append(msgs, llm.Message{
			Role:    "system",
			Content: "## 项目共享状态\n" + summary,
		})
	}

	msgs = append(msgs, llm.Message{Role: "user", Content: r.buildNodeInput(node)})
	// 工具结果只回传给发起工具的同一个 agent（隔离，不外泄）。
	// OpenAI 协议要求 role=tool 的消息必须紧跟在带 tool_calls 的 assistant
	// 消息之后，因此这里先回放该 assistant 消息再追加工具结果。
	if r.pendingToolMsg != nil {
		msgs = append(msgs, *r.pendingToolMsg)
	}
	msgs = append(msgs, r.pendingToolResults...)
	// Writer 上一轮没有产出正文时，追加一条明确的纠正指令，避免它继续只调工具。
	if node == "writer" && r.writerNudge {
		msgs = append(msgs, llm.Message{
			Role:    "user",
			Content: "注意：上一轮没有产出可保存的本章正文。请直接输出本章正文（Markdown，至少 800 字），不要只调用 get_book_info 等查询工具；写完后调用 save_chapter 或 update_chapter，再调用 route 转 guard。",
		})
	}
	return trimMessages(msgs, maxAgentInputTokens)
}

// buildNodeInput 渲染节点的任务/上下文。调度层负责组装台账上下文，
// 角色节点只看到自己的分层记忆，Writer 只看到决策包与台账。
func (r *bookAgentRun) buildNodeInput(node string) string {
	header := fmt.Sprintf("## 项目任务\n\n书籍ID: %s\n\n%s\n\n用户需求: %s",
		r.bookID, r.buildBookInfo(), r.prompt)

	switch node {
	case "orchestrator":
		return header + "\n\n" + r.orchestratorState()
	case "architect":
		return header + "\n\n## 用户需求\n\n" + r.prompt
	case "character":
		return header + "\n\n" + r.buildCharacterContext(r.currentCastMember())
	case "writer":
		return header + "\n\n" + r.buildWriterInput()
	case "guard":
		return header + "\n\n" + r.buildGuardInput()
	}
	return header
}

func (r *bookAgentRun) buildWriterInput() string {
	ch := r.currentChapter()
	chapter := r.chapterNumber()

	if r.reworkPending && r.currentDraft() != "" {
		return "## 待修订正文\n\n" + r.currentDraft() +
			"\n\n## 需要修正的一致性问题\n\n" + r.issuesText() +
			"\n\n请根据以上问题修订本章正文后调用 route 切换到 guard。"
	}

	var sb strings.Builder
	if r.board != nil && r.board.Plan != "" {
		plan := r.board.Plan
		if len([]rune(plan)) > 4000 {
			plan = string([]rune(plan)[:4000]) + "..."
		}
		fmt.Fprintf(&sb, "## 全书大纲\n\n%s\n\n", plan)
	}

	fmt.Fprintf(&sb, "## 本章章纲（第%d章）\n\n", chapter)
	fmt.Fprintf(&sb, "- 标题：%s\n", ch.Title)
	if ch.Summary != "" {
		fmt.Fprintf(&sb, "- 核心事件：%s\n", ch.Summary)
	}
	if len(ch.Characters) > 0 {
		fmt.Fprintf(&sb, "- 出场角色：%s\n", strings.Join(ch.Characters, "、"))
	}
	if len(ch.Slots) > 0 {
		fmt.Fprintf(&sb, "- 功能槽位：%s\n", strings.Join(ch.Slots, "；"))
	}
	if ch.Location != "" {
		fmt.Fprintf(&sb, "- 地点：%s\n", ch.Location)
	}
	if ch.NarrativeTime != "" {
		fmt.Fprintf(&sb, "- 叙事时间：%s\n", ch.NarrativeTime)
	}
	if ch.Foreshadow != "" {
		fmt.Fprintf(&sb, "- 本章伏笔：%s\n", ch.Foreshadow)
	}
	if ch.ResolveForeshadow != "" {
		fmt.Fprintf(&sb, "- 本章回收：%s\n", ch.ResolveForeshadow)
	}

	if len(r.decisionPacks) > 0 {
		sb.WriteString("\n## 角色决策包\n\n")
		names := make([]string, 0, len(r.decisionPacks))
		for name := range r.decisionPacks {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			fmt.Fprintf(&sb, "### %s\n%s\n\n", name, clipText(r.decisionPacks[name], 3000))
		}
	} else {
		sb.WriteString("\n## 角色决策包\n\n本章没有激活角色 Agent，请严格依据台账状态与章纲渲染。\n")
	}

	if summary := r.ledgerSummary(); summary != "" {
		sb.WriteString("\n## 结构台账\n\n" + summary + "\n")
	}
	if previous := r.previousChapterContext(); previous != "" {
		sb.WriteString("\n" + previous + "\n")
	}
	sb.WriteString("\n只输出本章正文（Markdown），不要输出其它章节，也不要输出调度/说明文字。完成后调用 route 切换到 guard。")
	return sb.String()
}

func (r *bookAgentRun) buildGuardInput() string {
	draft := r.currentDraft()
	if draft == "" {
		draft = r.handoff.Output
	}
	ch := r.currentChapter()

	var sb strings.Builder
	fmt.Fprintf(&sb, "## 待校验正文（第%d章《%s》）\n\n%s\n\n", r.chapterNumber(), ch.Title, draft)
	sb.WriteString("## 本章章纲\n\n")
	if ch.Summary != "" {
		fmt.Fprintf(&sb, "- 核心事件：%s\n", ch.Summary)
	}
	if len(ch.Characters) > 0 {
		fmt.Fprintf(&sb, "- 出场角色：%s\n", strings.Join(ch.Characters, "、"))
	}
	if ch.Location != "" {
		fmt.Fprintf(&sb, "- 地点：%s\n", ch.Location)
	}
	if summary := r.ledgerSummary(); summary != "" {
		sb.WriteString("\n## 结构台账\n\n" + summary + "\n")
	}
	sb.WriteString("\n## 连续性与伏笔预警\n\n" + r.guardWarnings() + "\n")
	sb.WriteString("\n请检查正文与台账是否一致，输出报告和结论标记。完成后调用 route 切换到 orchestrator。")
	return sb.String()
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
	r.sse.Write("user_message", jsonPayload(userMessageEvent{
		Agent:     "user",
		Role:      "user",
		Content:   r.prompt,
		Timestamp: time.Now().UnixMilli(),
		RecordID:  r.recordID,
	}))
}

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
func (r *bookAgentRun) runAgent(ctx context.Context, node string) (*llm.Message, error) {
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

	var toolList []llm.Tool
	if !r.noNativeTools {
		toolList = bookAgentToolsForRole(node)
	}
	msg, err := r.streamNode(ctx, msgs, toolList, emitDelta)
	if err != nil && len(toolList) > 0 && llm.IsToolsUnsupported(err) {
		// 兼容不支持 function calling 的模型：去掉 tools 重试一次，并记住
		// 该模式，避免后续每个节点都先失败一次。
		r.noNativeTools = true
		msg, err = r.streamNode(ctx, msgs, nil, emitDelta)
	}
	if err != nil && llm.IsContextLengthExceeded(err) {
		// 上下文超限：强制压缩本节点输入（优先保留尾部任务/工具结果）后重试。
		msgs = trimMessages(msgs, maxAgentInputTokens/3)
		msg, err = r.streamNode(ctx, msgs, toolList, emitDelta)
	}
	if err != nil {
		return nil, err
	}
	r.outputTruncated = msg.FinishReason == llm.FinishLength

	fullContent := msg.Content
	calls := []bookToolCall{}
	if !r.outputTruncated {
		calls = r.collectToolCalls(msg, fullContent)
	}

	// 所有工具调用都进入 out.ToolCalls，由 executeSingleTool 做白名单校验
	// 并返回拒绝结果，这样模型能收到反馈并自行纠正（而不是被静默丢弃）。
	out := &llm.Message{Role: "assistant", Content: fullContent, FinishReason: msg.FinishReason}
	for _, c := range calls {
		r.sse.Write("tool_call", jsonPayload(bookAgentToolCallEvent{Agent: node, Name: c.Name}))
		argsJSON, _ := json.Marshal(c.Args)
		out.ToolCalls = append(out.ToolCalls, llm.ToolCall{
			ID:   c.ID,
			Type: "function",
			Function: llm.ToolCallFunction{
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

// streamNode 通过 llm.StreamingLLM 统一接口执行一次节点调用：文本增量交给
// onDelta 实时输出，终止块返回完整消息。原实现直接调用 Client.Stream，
// 这里改为与 phero 一致的 ExecuteStream + CallOption 形式。
func (r *bookAgentRun) streamNode(ctx context.Context, msgs []llm.Message, toolList []llm.Tool, onDelta func(string)) (*llm.Message, error) {
	var result *llm.Message
	for chunk, err := range r.client.ExecuteStream(ctx, msgs, llm.WithTools(toolList...)) {
		if err != nil {
			return nil, err
		}
		if chunk.TextDelta != "" {
			onDelta(chunk.TextDelta)
		}
		if chunk.Done {
			result = chunk.Message
		}
	}
	if result == nil {
		return nil, fmt.Errorf("llm stream ended without a final message")
	}
	return result, nil
}

// collectToolCalls 合并模型返回的标准工具调用、DSML 编码解析结果，
// 以及最后手段的纯文本启发式解析。
func (r *bookAgentRun) collectToolCalls(msg *llm.Message, fullContent string) []bookToolCall {
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
func hasValidBookToolCalls(msg *llm.Message) bool {
	return len(msg.ToolCalls) > 0
}

// hasToolCall 报告 msg 是否包含当前 Agent 有权调用的指定工具。
func (r *bookAgentRun) hasToolCall(msg *llm.Message, names ...string) bool {
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

// hasPendingRoute 报告是否有待处理的 route 目标（加锁读取）。
func (r *bookAgentRun) hasPendingRoute() bool {
	r.pendingMu.Lock()
	defer r.pendingMu.Unlock()
	return r.pendingRoute != ""
}

// bookAgentRouteTransitions 限定显式 route 的合法跳转，防止模型在节点之间
// 互相跳转形成死循环；end 永远允许。
var bookAgentRouteTransitions = map[string]map[string]bool{
	"orchestrator": {"architect": true, "character": true, "writer": true, "guard": true},
	"architect":    {"orchestrator": true, "character": true, "writer": true},
	"character":    {"writer": true, "orchestrator": true},
	"writer":       {"guard": true},
	"guard":        {"orchestrator": true, "writer": true},
}

func bookAgentRouteAllowed(from, to string) bool {
	if to == "end" {
		return true
	}
	return bookAgentRouteTransitions[from][to]
}

// progressKey 是流程进度的指纹：章节游标、当前章节 id、大纲长度、
// 角色决策数量与正文内容。
func (r *bookAgentRun) progressKey() string {
	return fmt.Sprintf("%d|%s|%d|%d|%d|%t|%d|%t",
		r.completedChapters, r.chapterID, len(r.outlineChapters),
		r.lastDraftCursor, crc32.ChecksumIEEE([]byte(r.lastDraft)),
		r.castPrepared, len(r.decisionPacks), r.chapterFinalized)
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
	// Guard 结论处理：通过才定稿写回台账并推进章节；不通过退回 Writer 一次。
	if r.currentPhase == "guard" {
		switch r.lastVerdict {
		case "通过":
			r.finalizeCurrentChapter()
			r.markChapterComplete()
			return "orchestrator"
		case "不通过":
			if !r.reworkPending {
				// 退回 writer 重写当前章，保留章节 id 以便更新同一行。
				r.reworkPending = true
				r.clearPendingRoute()
				return "writer"
			}
			// 返工后仍不通过：保留当前版本并记录问题，避免死循环。
			r.recordIssueText("返工后 Guard 仍判定不通过，已保留当前版本")
			r.finalizeCurrentChapter()
			r.markChapterComplete()
			return "orchestrator"
		default:
			// 没有结论标记：重检一次；仍无结论则按通过处理并记录问题。
			if r.guardRetries < 1 {
				r.guardRetries++
				r.clearPendingRoute()
				return "guard"
			}
			r.recordIssueText("Guard 未输出结论标记，已按通过处理")
			r.finalizeCurrentChapter()
			r.markChapterComplete()
			return "orchestrator"
		}
	}

	r.pendingMu.Lock()
	target := r.pendingRoute
	r.pendingRoute = ""
	r.pendingMu.Unlock()

	// 拒绝非法跳转，交由下方按阶段兜底，避免节点间互相跳转形成死循环。
	if target != "" && !bookAgentRouteAllowed(r.currentPhase, target) {
		log.Printf("BookAgent 非法路由 %s -> %s，已忽略", r.currentPhase, target)
		target = ""
	}
	// 只有调度层可以结束流程，防止 Writer/Guard 绕过校验直接收尾。
	if target == "end" && r.currentPhase != "orchestrator" {
		target = ""
	}

	// writer 未成功落库章节却请求离开（或没有 route）：重试一次，避免
	// 空章节进入校验流程造成“幽灵完成”。
	if r.currentPhase == "writer" && r.chapterID == "" && r.writerRetries < 1 &&
		(target == "" || target == "guard") {
		r.writerRetries++
		return "writer"
	}

	if target == "end" {
		return bookAgentEnd
	}
	if len(r.outlineChapters) > 0 && !r.hasMoreChapters() {
		return bookAgentEnd
	}

	switch target {
	case "architect":
		return "architect"
	case "character":
		if len(r.outlineChapters) == 0 {
			return "architect"
		}
		if !r.castPrepared {
			return "cast"
		}
		if len(r.castQueue) > 0 {
			return "character"
		}
		return "writer"
	case "writer":
		if len(r.outlineChapters) == 0 {
			return "architect"
		}
		if !r.castPrepared {
			return "cast"
		}
		if len(r.castQueue) > 0 && r.currentDraft() == "" {
			return "character"
		}
		return "writer"
	case "guard":
		if r.currentDraft() == "" {
			// Writer 已连续多轮没有产出正文：不再退回 Writer 形成死循环，
			// 直接终止本轮运行并给出可理解的原因。
			if r.writerMisses >= bookAgentMaxWriterMisses {
				r.abortRun(fmt.Sprintf("Writer 连续 %d 轮未产出本章正文（第%d章），已停止；已完成章节已保存，请重试",
					r.writerMisses, r.chapterNumber()))
				return bookAgentEnd
			}
			return "writer"
		}
		return "guard"
	}

	// 模型没有调用 route：按阶段兜底。
	switch r.currentPhase {
	case "orchestrator":
		if len(r.outlineChapters) == 0 {
			return "architect"
		}
		if !r.castPrepared {
			return "cast"
		}
		if r.currentDraft() != "" {
			return "guard"
		}
		if len(r.castQueue) > 0 {
			return "character"
		}
		return "writer"
	case "architect":
		if len(r.outlineChapters) == 0 {
			return "orchestrator"
		}
		return "cast"
	case "character":
		if len(r.castQueue) > 0 {
			return "character"
		}
		return "writer"
	case "writer":
		return "guard"
	default:
		return "orchestrator"
	}
}

func (r *bookAgentRun) clearPendingRoute() {
	r.pendingMu.Lock()
	r.pendingRoute = ""
	r.pendingMu.Unlock()
}

// abortRun 记录问题并向前端输出明确的终止原因；置位 aborted 后不再补发 done。
func (r *bookAgentRun) abortRun(reason string) {
	r.recordIssueText(reason)
	r.aborted = true
	if r.sse != nil {
		r.sse.Write("error", reason)
	}
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
	// 串行标记由 tools 注册表上的 Exclusive 声明统一维护。
	reg := r.toolsReg
	if reg == nil {
		reg = newBookToolRegistry(r)
	}
	hasSerial := false
	for _, c := range calls {
		if tool, ok := reg.Get(c.Name); ok && tool.Exclusive() {
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
	reg := r.toolsReg
	if reg == nil {
		reg = newBookToolRegistry(r)
	}
	return reg.Execute(context.Background(), name, args)
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

func (r *bookAgentRun) toolGetBookInfo(args getBookInfoArgs) (string, error) {
	bookID := args.BookID
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
func (r *bookAgentRun) toolGetChapter(args getChapterArgs) (string, error) {
	chapterID := args.ChapterID
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

	bookID := args.BookID
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
	return fmt.Sprintf("# %s\n\n%s", chapter.Title, clipText(chapter.EffectiveContent(), bookAgentMaxToolResultChars))
}

// previousChapterContext 返回上一章末尾片段，用于让新章节自然承接前文。
// 只读取上一章一行，避免随章节增多而反复载入整本书的正文。
func (r *bookAgentRun) previousChapterContext() string {
	order := r.chapterNumber() - 1
	if order <= 0 {
		return ""
	}
	previous, err := db.GetChapterByOrder(r.bookID, int64(order))
	if err != nil || previous == nil {
		return ""
	}
	text := previous.EffectiveContent()
	if isBlank(text) {
		return ""
	}
	return fmt.Sprintf("## 上一章《%s》结尾（承接用）\n\n%s", previous.Title, tailText(text, 1200))
}

func (r *bookAgentRun) toolSaveChapter(args saveChapterArgs) (string, error) {
	bookID := args.BookID
	if bookID == "" {
		bookID = r.bookID
	}
	if bookID == "" {
		return "保存失败：缺少 bookId", nil
	}
	title := strings.TrimSpace(args.Title)
	content := stripChapterHeading(args.Content)
	if strings.TrimSpace(content) == "" {
		return "保存失败：章节内容为空", nil
	}
	order := args.Order
	if order <= 0 {
		order = int64(r.chapterNumber())
	}
	if title == "" {
		title = fmt.Sprintf("第%d章", order)
	}

	// 当前章节已存在（返工/续写）时更新同一行，避免重复建章。
	if r.chapterID != "" {
		// AI 写的正文写入 aiRes，content 只由人工编辑写入。
		chapter, err := db.UpdateChapter(r.chapterID, map[string]any{
			"title": title, "aiRes": content, "wordCount": int64(jsLen(content)),
			"isAi": int64(1),
		})
		if err != nil {
			return "", err
		}
		if chapter == nil {
			return "章节更新失败", nil
		}
		r.setLastDraft(content)
		// 章节已写库，立即通知前端刷新章节列表
		r.emitChapterSaved(chapter, false)
		return fmt.Sprintf("章节更新成功: %s (id: %s)", chapter.Title, chapter.ID), nil
	}

	c := &db.Chapter{
		ID:     db.NewID(),
		BookID: bookID,
		Title:  title,
		// AI 生成的正文只写 aiRes，content 留给人工写作。
		AIRes:     content,
		IsAI:      1,
		WordCount: int64(jsLen(content)),
		Order:     order,
		Metadata:  json.RawMessage("{}"),
	}
	if _, err := db.CreateChapter(c); err != nil {
		return "", err
	}
	r.chapterID = c.ID
	r.setLastDraft(content)
	// 新章节已创建，立即通知前端刷新章节列表
	r.emitChapterSaved(c, true)
	return fmt.Sprintf("章节保存成功: %s (id: %s)", c.Title, c.ID), nil
}

func (r *bookAgentRun) toolUpdateChapter(args updateChapterArgs) (string, error) {
	chapterID := args.ChapterID
	if chapterID == "" {
		chapterID = r.chapterID
	}
	if chapterID == "" {
		return "章节更新失败：缺少 chapterId，且当前没有正在处理的章节", nil
	}
	updates := map[string]any{}
	if args.Content != nil {
		content := stripChapterHeading(*args.Content)
		// AI 写的正文写入 aiRes，content 只由人工编辑写入。
		updates["aiRes"] = content
		updates["isAi"] = int64(1)
		updates["wordCount"] = int64(jsLen(content))
	}
	if args.Title != nil {
		updates["title"] = *args.Title
	}
	chapter, err := db.UpdateChapter(chapterID, updates)
	if err != nil {
		return "", err
	}
	if chapter == nil {
		return "章节更新失败", nil
	}
	if chapterID == r.chapterID {
		if content, ok := updates["aiRes"].(string); ok {
			r.setLastDraft(content)
		}
	}
	// 章节已写库，立即通知前端刷新章节列表
	r.emitChapterSaved(chapter, false)
	return fmt.Sprintf("章节更新成功: %s", chapter.Title), nil
}

func (r *bookAgentRun) toolRoute(args routeArgs) (string, error) {
	target := args.Target
	switch target {
	case "orchestrator", "architect", "character", "writer", "guard", "end":
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
		// 返工或续写：更新同一条章节。AI 正文写入 aiRes。
		updated, err := db.UpdateChapter(r.chapterID, map[string]any{
			"title": title, "aiRes": pureContent, "wordCount": int64(jsLen(pureContent)),
			"isAi": int64(1),
		})
		if err != nil {
			log.Printf("[auto-save] 章节更新失败: %v", err)
			return
		}
		r.setLastDraft(pureContent)
		// 章节已写库，立即通知前端刷新章节列表
		r.emitChapterSaved(updated, false)
		return
	}

	created, err := db.CreateChapter(&db.Chapter{
		ID:     db.NewID(),
		BookID: r.bookID,
		Title:  title,
		// AI 生成的正文只写 aiRes，content 留给人工写作。
		AIRes:     pureContent,
		IsAI:      1,
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
	// 新章节已创建，立即通知前端刷新章节列表
	r.emitChapterSaved(created, true)
}

// emitChapterSaved 在章节写库成功后推送 chapter_saved 事件，
// 前端据此立即刷新章节列表，无需等整轮流程结束。
func (r *bookAgentRun) emitChapterSaved(chapter *db.Chapter, created bool) {
	// 单测等无 SSE 输出通道的场景直接跳过
	if chapter == nil || r.sse == nil {
		return
	}
	r.sse.Write("chapter_saved", jsonPayload(chapterSavedEvent{
		Agent:     r.currentAgent,
		ChapterID: chapter.ID,
		Title:     chapter.Title,
		Order:     chapter.Order,
		Created:   created,
	}))
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
