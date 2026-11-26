package agent

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"memo/internal/ai/config"
	"memo/internal/ai/llm"
	"memo/internal/ai/memory"
	"memo/internal/ai/tools"

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
- update_memory: 根据 ID 修改记忆的标题或星标状态
当用户请求相关操作时，请调用合适的工具。请用中文回复。`
)

// maxAgentRounds 对应此前的 maxRounds / recursionLimit = 10。
const maxAgentRounds = 10

// aiClient 是 react.go 需要的客户端抽象：既能流式调用，也能导出请求头用于日志。
type aiClient interface {
	llm.StreamingLLM
	RequestHeaders() http.Header
}

// streamWithHeaderLog 在每次 AI 调用前打印请求头，再执行流式请求。
// 原实现直接调用 Client.Stream，现改为 phero 风格的 ExecuteStream +
// WithTools 调用选项：
//
//	func streamWithHeaderLog(ctx context.Context, client *llm.Client, messages []llm.Message, toolList []llm.Tool, onDelta func(string)) (*llm.Message, error) {
//		logAIRequestHeaders(client)
//		return client.Stream(ctx, messages, toolList, onDelta)
//	}
func streamWithHeaderLog(ctx context.Context, client aiClient, messages []llm.Message, toolList []llm.Tool, onDelta func(string)) (*llm.Message, error) {
	logAIRequestHeaders(client)

	var result *llm.Message
	for chunk, err := range client.ExecuteStream(ctx, messages, llm.WithTools(toolList...)) {
		if err != nil {
			return nil, err
		}
		if chunk.TextDelta != "" && onDelta != nil {
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

// logAIRequestHeaders 打印单次 AI 调用的请求头。Authorization 会脱敏，
// 避免把 API Key 明文写入日志。
func logAIRequestHeaders(client aiClient) {
	headers := client.RequestHeaders()
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

// ──────────────────── 流式对话 ────────────────────

// RunChatStream 对应 LangGraphService.chatStream：不带工具的纯流式补全。
// 每个文本片段以 message 事件发出，运行以 done / [DONE] 结束。
func RunChatStream(parent context.Context, req ChatRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		memory.RegisterAbort(req.RequestID, cancel)
		defer memory.UnregisterAbort(req.RequestID)
	}

	client := llm.NewClient(config.ResolveRequest(req.Model, req.BaseURL), req.APIKey, "", 0.7)
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
		if msg.FinishReason != llm.FinishLength || isBlank(msg.Content) {
			break
		}
		messages = append(messages,
			llm.Message{Role: "assistant", Content: msg.Content},
			llm.Message{Role: "user", Content: "上一条回复因长度限制被截断，请从中断处直接继续，不要重复已输出的内容。"},
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

// RunAgent 对应 LangGraphService.runAgent：流式工具调用循环（最多
// maxAgentRounds 轮）。文本增量以 message 事件实时发出，工具调用以
// tool_call 事件宣告、结果以 tool 事件回传；同轮多个工具并发执行。
func RunAgent(parent context.Context, req ChatRequest, sse Emitter) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if req.RequestID != "" {
		memory.RegisterAbort(req.RequestID, cancel)
		defer memory.UnregisterAbort(req.RequestID)
	}

	client := llm.NewClient(config.ResolveRequest(req.Model, req.BaseURL), req.APIKey, "", 0.7)
	messages := buildMessages(req, DefaultSystemPrompt)

	terminated := false
	contextTrimmed := false
	continuations := 0
	toolList := agentTools
	for round := 0; round < maxAgentRounds; round++ {
		if ctx.Err() != nil {
			break
		}

		// 每一轮都以流式方式调用：文本实时推送给前端，同时由客户端累积
		// 工具调用。对忽略 stream=true 的服务端，Client 会自动回退。
		streamed := false
		msg, err := streamWithHeaderLog(ctx, client, messages, toolList, func(delta string) {
			if delta == "" || ctx.Err() != nil {
				return
			}
			streamed = true
			sse.Write("message", delta)
		})
		if err != nil {
			// 模型不支持 function calling：去掉 tools 重试，至少保证纯文本可用。
			if len(toolList) > 0 && llm.IsToolsUnsupported(err) {
				toolList = nil
				continue
			}
			// 上下文超限是可恢复的：裁剪最旧历史后重试一轮。
			if llm.IsContextLengthExceeded(err) && !contextTrimmed {
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
		if msg.FinishReason == llm.FinishLength && len(msg.ToolCalls) > 0 {
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
		if msg.FinishReason == llm.FinishLength {
			if continuations < 2 && !isBlank(msg.Content) {
				continuations++
				messages = append(messages,
					*msg,
					llm.Message{Role: "user", Content: "上一条回复因长度限制被截断，请从中断处直接继续，不要重复已输出的内容。"},
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

			outcomes := runToolCallsConcurrently(ctx, msg.ToolCalls, func(tc llm.ToolCall) (string, error) {
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
				messages = append(messages, llm.Message{
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
func buildMessages(req ChatRequest, defaultSystem string) []llm.Message {
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

	messages := make([]llm.Message, 0, len(history)+2)
	messages = append(messages, llm.Message{Role: "system", Content: system})
	for _, h := range history {
		role := "assistant"
		if h.Role == "user" {
			role = "user"
		}
		messages = append(messages, llm.Message{Role: role, Content: h.Content})
	}
	messages = append(messages, llm.Message{Role: "user", Content: req.Prompt})
	return trimMessages(messages, maxAgentInputTokens)
}

// ──────────────────── 工具 ────────────────────

// agentTools 由统一工具注册表生成，工具声明与 schema 见 tools/registry.go。
var agentTools = tools.ChatTools().Declarations()

// executeTool 分发一次工具调用并返回其文本结果，统一走聊天工具注册表。
func executeTool(name, rawArgs string) (string, error) {
	return tools.ChatTools().ExecuteRaw(context.Background(), name, rawArgs)
}
