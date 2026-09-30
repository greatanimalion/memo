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

// Default system prompts, copied verbatim from langgraph.service.ts.
const (
	ChatSystemPrompt = `你是一个中文 AI 助手。请简洁、准确地回答用户的问题。`

	DefaultSystemPrompt = `你是一个智能助手，可以调用工具来帮助用户。
可用工具：
- get_time: 查询当前时间
- write_diary: 记录日记（日期、待办事项、备注）
- get_memory: 搜索或列出用户的记忆/笔记
当用户请求相关操作时，请调用合适的工具。请用中文回复。`
)

// maxAgentRounds mirrors the previous maxRounds / recursionLimit = 10.
const maxAgentRounds = 10

const (
	cancelEventText = "请求已取消"
	doneEventText   = "[DONE]"
)

// Emitter is the SSE sink used by the handlers (satisfied by *response.SSE).
type Emitter interface {
	Write(event, data string)
}

// HistoryMessage is one entry of the request body `history` array.
type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the JSON body accepted by /api/chat-stream and /api/chat-agent.
type ChatRequest struct {
	Prompt       string           `json:"prompt"`
	History      []HistoryMessage `json:"history"`
	Model        string           `json:"model"`
	APIKey       string           `json:"apiKey"`
	RequestID    string           `json:"requestId"`
	SystemPrompt string           `json:"systemPrompt"`
}

// ──────────────────── Cancellation registry ────────────────────

var (
	abortMu       sync.Mutex
	abortControls = map[string]context.CancelFunc{}
)

// RegisterAbort stores the cancel function of an in flight request.
func RegisterAbort(requestID string, cancel context.CancelFunc) {
	abortMu.Lock()
	defer abortMu.Unlock()
	abortControls[requestID] = cancel
}

// UnregisterAbort drops the entry once the request finished.
func UnregisterAbort(requestID string) {
	abortMu.Lock()
	defer abortMu.Unlock()
	delete(abortControls, requestID)
}

// AbortRequest cancels the request with the given id. It reports whether the
// request existed (false means the caller should answer 404).
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

// ──────────────────── Streaming chat ────────────────────

// RunChatStream mirrors LangGraphService.chatStream: a plain streaming
// completion without tools. Every text fragment is emitted as a `message`
// event, the run ends with `done` / `[DONE]`.
func RunChatStream(parent context.Context, req ChatRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		RegisterAbort(req.RequestID, cancel)
		defer UnregisterAbort(req.RequestID)
	}

	client := NewClient(ResolveModel(req.Model), req.APIKey, "", 0.7)
	messages := buildMessages(req, ChatSystemPrompt)

	_, err := client.Stream(ctx, messages, nil, func(fragment string) {
		if fragment != "" && ctx.Err() == nil {
			sse.Write("message", fragment)
		}
	})

	switch {
	case ctx.Err() != nil:
		sse.Write("cancel", cancelEventText)
	case err != nil:
		log.Printf("ChatStream 执行错误: %v", err)
		sse.Write("error", err.Error())
	}
	sse.Write("done", doneEventText)
}

// ──────────────────── Agent loop ────────────────────

type toolCallEvent struct {
	Name string `json:"name"`
}

type toolResultEvent struct {
	Name   string `json:"name"`
	Result string `json:"result"`
}

// RunAgent mirrors LangGraphService.runAgent: a tool calling loop (at most
// maxAgentRounds non streaming calls). Tool calls are announced with
// `tool_call`, their results with `tool`, the final text is sent at once as a
// single `message` event.
func RunAgent(parent context.Context, req ChatRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		RegisterAbort(req.RequestID, cancel)
		defer UnregisterAbort(req.RequestID)
	}

	client := NewClient(ResolveModel(req.Model), req.APIKey, "", 0.7)
	messages := buildMessages(req, DefaultSystemPrompt)

	terminated := false
	for round := 0; round < maxAgentRounds; round++ {
		if ctx.Err() != nil {
			break
		}

		msg, err := client.Chat(ctx, messages, agentTools)
		if err != nil {
			writeAbortOrError(sse, ctx, err)
			sse.Write("done", doneEventText)
			return
		}

		if len(msg.ToolCalls) > 0 {
			for _, tc := range msg.ToolCalls {
				sse.Write("tool_call", jsonPayload(toolCallEvent{Name: tc.Function.Name}))
			}
			messages = append(messages, *msg)
			for _, tc := range msg.ToolCalls {
				result, toolErr := executeTool(tc.Function.Name, tc.Function.Arguments)
				if toolErr != nil {
					// ToolNode converts failures into an error tool result and
					// lets the model retry (handleToolErrors defaults to true).
					result = fmt.Sprintf("Error: %s\n Please fix your mistakes.", toolErr)
				}
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

		if msg.Content != "" {
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

// buildMessages assembles [system, ...history, user] the same way the previous
// implementation did: role "user" stays a user message, every other role
// becomes an assistant message.
func buildMessages(req ChatRequest, defaultSystem string) []Message {
	system := req.SystemPrompt
	if system == "" {
		system = defaultSystem
	}
	messages := make([]Message, 0, len(req.History)+2)
	messages = append(messages, Message{Role: "system", Content: system})
	for _, h := range req.History {
		role := "assistant"
		if h.Role == "user" {
			role = "user"
		}
		messages = append(messages, Message{Role: role, Content: h.Content})
	}
	return append(messages, Message{Role: "user", Content: req.Prompt})
}

// jsonPayload renders a payload exactly like JSON.stringify would: no HTML
// escaping, no trailing newline, struct field order preserved.
func jsonPayload(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return strings.TrimRight(buf.String(), "\n")
}

// ──────────────────── Tools ────────────────────

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

// executeTool dispatches one tool call and returns its textual result.
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

// writeDiary stores one day into the diary row identified by `date`.
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
	if _, err := db.UpdateDiary(args.Date, map[string]json.RawMessage{args.Date: day}); err != nil {
		return "", err
	}
	return "日记记录成功，日期：" + args.Date, nil
}

type searchMemoryArgs struct {
	Keyword string `json:"keyword"`
}

// searchMemory lists or searches non folder memories (get_memory tool).
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
