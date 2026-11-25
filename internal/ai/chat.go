package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"slices"
	"strings"
	"sync"
	"time"

	"memo/internal/db"

	_ "time/tzdata"
)

// 默认 system 提示词，逐字取自 langgraph.service.ts。
const (
	ChatSystemPrompt = `你是一个中文 AI 助手。请简洁、准确地回答用户的问题。`

	DefaultSystemPrompt = `你是一个智能助手，可以调用工具来帮助用户。
可用工具：
- get_time: 查询当前时间
- write_diary: 记录日记（日期、待办事项、备注）
- get_memory: 搜索或列出用户的记忆/笔记
当用户请求相关操作时，请调用合适的工具。请用中文回复。`
)

// maxAgentRounds 对应此前的 maxRounds / recursionLimit = 10。
const maxAgentRounds = 10

const (
	cancelEventText = "请求已取消"
	doneEventText   = "[DONE]"
)

// streamWithHeaderLog 在每次 AI 调用前打印请求头，再执行流式请求。
func streamWithHeaderLog(ctx context.Context, client *Client, messages []Message, tools []Tool, onDelta func(string)) (*Message, error) {
	logAIRequestHeaders(client)
	return client.Stream(ctx, messages, tools, onDelta)
}

// logAIRequestHeaders 打印单次 AI 调用的请求头。Authorization 会脱敏，
// 避免把 API Key 明文写入日志。
func logAIRequestHeaders(client *Client) {
	headers := client.requestHeaders()
	if auth := headers.Get("Authorization"); auth != "" {
		headers.Set("Authorization", maskAuthorization(auth))
	}
	log.Printf("AI 请求头: %v", headers)
}

// maskAuthorization 完全隐藏 Bearer token，避免 API Key 出现在日志中。
func maskAuthorization(value string) string {
	const prefix = "Bearer "
	if _, ok := strings.CutPrefix(value, prefix); ok {
		return prefix + "***"
	}
	return "***"
}

// Emitter 是处理器使用的 SSE 输出接口（由 *response.SSE 实现）。
type Emitter interface {
	Write(event, data string)
}

// HistoryMessage 是请求体 history 数组中的一项。
type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest 是 /api/chat-stream 和 /api/chat-agent 接受的 JSON 请求体。
type ChatRequest struct {
	Prompt       string           `json:"prompt"`
	History      []HistoryMessage `json:"history"`
	Model        string           `json:"model"`
	BaseURL      string           `json:"baseUrl"`
	APIKey       string           `json:"apiKey"`
	RequestID    string           `json:"requestId"`
	SystemPrompt string           `json:"systemPrompt"`
}

// ──────────────────── 取消注册表 ────────────────────

var (
	abortMu       sync.Mutex
	abortControls = map[string]context.CancelFunc{}

	// diaryWriteMu 串行化 AI 对日记的读-改-写，避免同轮多个 write_diary 调用
	// 或并发请求互相覆盖同一个月份的数据。
	diaryWriteMu sync.Mutex
)

// RegisterAbort 保存进行中请求的取消函数。
func RegisterAbort(requestID string, cancel context.CancelFunc) {
	abortMu.Lock()
	defer abortMu.Unlock()
	abortControls[requestID] = cancel
}

// UnregisterAbort 在请求结束后删除对应条目。
func UnregisterAbort(requestID string) {
	abortMu.Lock()
	defer abortMu.Unlock()
	delete(abortControls, requestID)
}

// AbortRequest 取消指定 id 的请求。返回该请求是否存在
// （false 表示调用方应返回 404）。
func AbortRequest(requestID string) bool {
	abortMu.Lock()
	cancel, ok := abortControls[requestID]
	if ok {
		delete(abortControls, requestID)
	}
	abortMu.Unlock()
	if ok {
		cancel()
	}
	return ok
}

// ──────────────────── 流式对话 ────────────────────

// RunChatStream 对应 LangGraphService.chatStream：不带工具的纯流式补全。
// 每个文本片段以 message 事件发出，运行以 done / [DONE] 结束。
func RunChatStream(parent context.Context, req ChatRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		RegisterAbort(req.RequestID, cancel)
		defer UnregisterAbort(req.RequestID)
	}

	client := NewClient(ResolveRequest(req.Model, req.BaseURL), req.APIKey, "", 0.7)
	messages := buildMessages(req, ChatSystemPrompt)

	var runErr error
	for continuation := 0; continuation < 3; continuation++ {
		msg, err := streamWithHeaderLog(ctx, client, messages, nil, func(fragment string) {
			if fragment != "" && ctx.Err() == nil {
				sse.Write("message", fragment)
			}
		})
		if err != nil {
			runErr = err
			break
		}
		// 输出达到长度上限时自动请求续写，避免长回答被静默截断。
		if msg.FinishReason != FinishLength || isBlank(msg.Content) {
			break
		}
		messages = append(messages,
			Message{Role: "assistant", Content: msg.Content},
			Message{Role: "user", Content: "上一条回复因长度限制被截断，请从中断处直接继续，不要重复已输出的内容。"},
		)
		messages = trimMessages(messages, maxAgentInputTokens)
	}

	switch {
	case ctx.Err() != nil:
		sse.Write("cancel", cancelEventText)
	case runErr != nil:
		log.Printf("ChatStream 执行错误: %v", runErr)
		sse.Write("error", runErr.Error())
	}
	sse.Write("done", doneEventText)
}

// ──────────────────── Agent 循环 ────────────────────

type toolCallEvent struct {
	Name string `json:"name"`
}

type toolResultEvent struct {
	Name   string `json:"name"`
	Result string `json:"result"`
}

// RunAgent 对应 LangGraphService.runAgent：流式工具调用循环（最多
// maxAgentRounds 轮）。文本增量以 message 事件实时发出，工具调用以
// tool_call 事件宣告、结果以 tool 事件回传；同轮多个工具并发执行。
func RunAgent(parent context.Context, req ChatRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		RegisterAbort(req.RequestID, cancel)
		defer UnregisterAbort(req.RequestID)
	}

	client := NewClient(ResolveRequest(req.Model, req.BaseURL), req.APIKey, "", 0.7)
	messages := buildMessages(req, DefaultSystemPrompt)

	terminated := false
	contextTrimmed := false
	continuations := 0
	tools := agentTools
	for round := 0; round < maxAgentRounds; round++ {
		if ctx.Err() != nil {
			break
		}

		// 每一轮都以流式方式调用：文本实时推送给前端，同时由客户端累积
		// 工具调用。对忽略 stream=true 的服务端，Client 会自动回退。
		streamed := false
		msg, err := streamWithHeaderLog(ctx, client, messages, tools, func(delta string) {
			if delta == "" || ctx.Err() != nil {
				return
			}
			streamed = true
			sse.Write("message", delta)
		})
		if err != nil {
			// 模型不支持 function calling：去掉 tools 重试，至少保证纯文本可用。
			if len(tools) > 0 && IsToolsUnsupported(err) {
				tools = nil
				continue
			}
			// 上下文超限是可恢复的：裁剪最旧历史后重试一轮。
			if IsContextLengthExceeded(err) && !contextTrimmed {
				contextTrimmed = true
				messages = trimMessages(messages, maxAgentInputTokens/3)
				continue
			}
			writeAbortOrError(sse, ctx, err)
			sse.Write("done", doneEventText)
			return
		}

		// 输出达到长度上限时，工具参数很可能也被截断：不执行工具，直接
		// 把已生成文本交给用户，避免基于残缺参数产生副作用。
		if msg.FinishReason == FinishLength && len(msg.ToolCalls) > 0 {
			for _, tc := range msg.ToolCalls {
				sse.Write("tool_call", jsonPayload(toolCallEvent{Name: tc.Function.Name}))
				sse.Write("tool", jsonPayload(toolResultEvent{
					Name:   tc.Function.Name,
					Result: "工具参数因输出长度上限被截断，未执行。请用更小的参数重试。",
				}))
			}
			messages = append(messages, *msg)
			terminated = true
			break
		}

		// 纯文本回答被长度限制截断时，自动请求模型续写（最多两次）。
		if msg.FinishReason == FinishLength {
			if continuations < 2 && !isBlank(msg.Content) {
				continuations++
				messages = append(messages,
					*msg,
					Message{Role: "user", Content: "上一条回复因长度限制被截断，请从中断处直接继续，不要重复已输出的内容。"},
				)
				messages = trimMessages(messages, maxAgentInputTokens)
				continue
			}
			terminated = true
			break
		}

		if len(msg.ToolCalls) > 0 {
			for _, tc := range msg.ToolCalls {
				sse.Write("tool_call", jsonPayload(toolCallEvent{Name: tc.Function.Name}))
			}
			messages = append(messages, *msg)

			outcomes := runToolCallsConcurrently(ctx, msg.ToolCalls, func(tc ToolCall) (string, error) {
				return executeToolSafely(tc.Function.Name, tc.Function.Arguments)
			})
			for i, tc := range msg.ToolCalls {
				result := outcomes[i].Result
				if outcomes[i].Err != nil {
					// ToolNode 将失败转换为错误工具结果并让模型重试
					// （handleToolErrors 默认为 true）。
					result = formatToolError(outcomes[i].Err)
				}
				result = clipText(result, maxToolResultChars)
				sse.Write("tool", jsonPayload(toolResultEvent{Name: tc.Function.Name, Result: result}))
				messages = append(messages, Message{
					Role:       "tool",
					Content:    result,
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
				})
			}
			continue
		}

		// 文本已经在上面的流式回调中逐段发出；若服务端未触发回调
		// （理论上不会发生），再兜底发送一次完整内容。
		if !streamed && msg.Content != "" {
			sse.Write("message", msg.Content)
		}
		terminated = true
		break
	}

	switch {
	case ctx.Err() != nil:
		sse.Write("cancel", cancelEventText)
	case !terminated:
		err := fmt.Errorf(`Recursion limit of %d reached without hitting a stop condition. You can increase the limit by setting the "recursionLimit" config key.`, maxAgentRounds)
		log.Printf("Agent 执行错误: %v", err)
		sse.Write("error", err.Error())
	}
	sse.Write("done", doneEventText)
}

func writeAbortOrError(sse Emitter, ctx context.Context, err error) {
	if ctx.Err() != nil {
		sse.Write("cancel", cancelEventText)
		return
	}
	log.Printf("Agent 执行错误: %v", err)
	sse.Write("error", err.Error())
}

// buildMessages 按此前实现相同的方式组装 [system, ...history, user]：
// role 为 "user" 的保持用户消息，其他角色均转为 assistant 消息。
func buildMessages(req ChatRequest, defaultSystem string) []Message {
	system := req.SystemPrompt
	if system == "" {
		system = defaultSystem
	}
	// 前端可能把最新的用户消息同时放进 history 和 prompt，这里去重，
	// 避免同一个问题被发送两次。
	history := req.History
	if n := len(history); n > 0 && history[n-1].Role == "user" && history[n-1].Content == req.Prompt {
		history = history[:n-1]
	}

	messages := make([]Message, 0, len(history)+2)
	messages = append(messages, Message{Role: "system", Content: system})
	for _, h := range history {
		role := "assistant"
		if h.Role == "user" {
			role = "user"
		}
		messages = append(messages, Message{Role: role, Content: h.Content})
	}
	messages = append(messages, Message{Role: "user", Content: req.Prompt})
	return trimMessages(messages, maxAgentInputTokens)
}

// jsonPayload 完全按照 JSON.stringify 的方式渲染载荷：不做 HTML 转义、
// 无末尾换行、保持结构体字段顺序。
func jsonPayload(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return strings.TrimRight(buf.String(), "\n")
}

// ──────────────────── 工具 ────────────────────

var agentTools = []Tool{
	FuncTool("get_time", "获取当前日期和时间", map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}),
	FuncTool("write_diary", "记录日记，传入日期、待办事项列表和备注", map[string]any{
		"type": "object",
		"properties": map[string]any{
			"date": map[string]any{
				"type":        "string",
				"description": "日记日期，格式：YYYY-MM-DD",
			},
			"todos": map[string]any{
				"type":        "array",
				"description": "待办事项列表",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"text": map[string]any{
							"type":        "string",
							"description": "待办事项内容",
						},
					},
					"required": []string{"text"},
				},
			},
			"note": map[string]any{
				"type":        "string",
				"description": "日记备注或总结",
			},
		},
		"required": []string{"date", "todos"},
	}),
	FuncTool("get_memory", "搜索或列出用户的记忆/笔记，可按关键词搜索", map[string]any{
		"type": "object",
		"properties": map[string]any{
			"keyword": map[string]any{
				"type":        "string",
				"description": "搜索关键词，为空则列出最近的记忆",
			},
		},
	}),
}

// executeTool 分发一次工具调用并返回其文本结果。
func executeTool(name, rawArgs string) (string, error) {
	switch name {
	case "get_time":
		loc, err := time.LoadLocation("Asia/Shanghai")
		if err != nil {
			loc = time.FixedZone("CST", 8*3600)
		}
		return time.Now().In(loc).Format("2006/1/2 15:04:05"), nil
	case "write_diary":
		return writeDiary(rawArgs)
	case "get_memory":
		return searchMemory(rawArgs)
	}
	return "", fmt.Errorf("Tool %q not found.", name)
}

type diaryTodoArg struct {
	Text string `json:"text"`
}

type writeDiaryArgs struct {
	Date  string         `json:"date"`
	Todos []diaryTodoArg `json:"todos"`
	Note  string         `json:"note"`
}

type diaryTodoItem struct {
	ID        float64 `json:"id"`
	Text      string  `json:"text"`
	Completed bool    `json:"completed"`
}

type diaryDay struct {
	Todos []diaryTodoItem `json:"todos"`
	Note  string          `json:"note"`
}

// writeDiary 将一天的数据合并写入该日期所属月份的日记行。
// 日记表以 YYYY-MM 为 id、按月保存 monthDiarys，因此必须先读取该月已有
// 数据再合并当天，否则会覆盖整月或写到一个前端读不到的 id 上。
func writeDiary(rawArgs string) (string, error) {
	var args writeDiaryArgs
	if err := json.Unmarshal([]byte(rawArgs), &args); err != nil {
		return "", fmt.Errorf("failed to parse arguments: %w", err)
	}
	if args.Date == "" {
		return "", errors.New("date: required")
	}
	if args.Todos == nil {
		return "", errors.New("todos: required")
	}

	date, err := time.Parse("2006-01-02", args.Date)
	if err != nil {
		return "", fmt.Errorf("date: invalid format, want YYYY-MM-DD: %w", err)
	}
	dateKey := date.Format("2006-01-02")
	monthKey := date.Format("2006-01")

	items := make([]diaryTodoItem, 0, len(args.Todos))
	for _, t := range args.Todos {
		items = append(items, diaryTodoItem{
			ID:   float64(time.Now().UnixMilli()) + rand.Float64(),
			Text: t.Text,
		})
	}
	day, err := json.Marshal(diaryDay{Todos: items, Note: args.Note})
	if err != nil {
		return "", err
	}

	diaryWriteMu.Lock()
	defer diaryWriteMu.Unlock()

	monthDiarys := map[string]json.RawMessage{}
	existing, err := db.GetDiary(monthKey)
	if err != nil {
		return "", err
	}
	if existing != nil {
		for k, v := range existing.MonthDiarys {
			monthDiarys[k] = v
		}
	}
	monthDiarys[dateKey] = day

	if _, err := db.UpdateDiary(monthKey, monthDiarys); err != nil {
		return "", err
	}
	return "日记记录成功，日期：" + dateKey, nil
}

type searchMemoryArgs struct {
	Keyword string `json:"keyword"`
}

// searchMemory 列出或搜索非文件夹记忆（get_memory 工具）。
func searchMemory(rawArgs string) (string, error) {
	var args searchMemoryArgs
	if rawArgs != "" {
		if err := json.Unmarshal([]byte(rawArgs), &args); err != nil {
			return "", fmt.Errorf("failed to parse arguments: %w", err)
		}
	}
	all, err := db.ListMemories()
	if err != nil {
		return "", err
	}
	plain := make([]db.Memory, 0, len(all))
	for _, m := range all {
		if !m.IsFolder.Bool() {
			plain = append(plain, m)
		}
	}

	if args.Keyword != "" {
		keyword := strings.ToLower(args.Keyword)
		matches := make([]db.Memory, 0, len(plain))
		for _, m := range plain {
			if strings.Contains(strings.ToLower(m.Title), keyword) {
				matches = append(matches, m)
			}
		}
		if len(matches) == 0 {
			return "未找到匹配的记忆", nil
		}
		if len(matches) > 10 {
			matches = matches[:10]
		}
		return formatMemories(matches), nil
	}

	slices.SortStableFunc(plain, func(a, b db.Memory) int {
		av, bv := int64(0), int64(0)
		if a.VisitedTime != nil {
			av = *a.VisitedTime
		}
		if b.VisitedTime != nil {
			bv = *b.VisitedTime
		}
		switch {
		case av > bv:
			return -1
		case av < bv:
			return 1
		}
		return 0
	})
	if len(plain) == 0 {
		return "暂无记忆", nil
	}
	if len(plain) > 10 {
		plain = plain[:10]
	}
	return formatMemories(plain), nil
}

func formatMemories(items []db.Memory) string {
	lines := make([]string, 0, len(items))
	for _, m := range items {
		lines = append(lines, fmt.Sprintf("[%s] (id: %s)", m.Title, m.ID))
	}
	return strings.Join(lines, "\n")
}
