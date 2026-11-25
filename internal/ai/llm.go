package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// defaultHTTPClient 由所有 Client 共享。其 Transport 保持为 nil，从而在请求
// 时解析 http.DefaultTransport（测试可替换），同时复用标准库的连接池。
var defaultHTTPClient = &http.Client{}

const (
	// maxLLMAttempts 是遇到可重试错误（限流、5xx、网络错误）时的最大尝试次数。
	maxLLMAttempts = 3
	// maxLLMErrorBody 限制读取错误响应体的字节数，避免异常服务端拖垮内存。
	maxLLMErrorBody = 8 << 10
	// maxLLMResponseBody 限制非流式成功响应的大小（普通补全远小于此值）。
	maxLLMResponseBody = 32 << 20
)

// FinishReason 常量，与 OpenAI 协议一致。
const (
	FinishStop      = "stop"
	FinishLength    = "length"
	FinishToolCalls = "tool_calls"
)

// APIError 表示服务端以 HTTP 状态码拒绝请求。错误文本保持原有
// "llm http <code>: <body>" 形式，便于前端与既有测试继续使用。
type APIError struct {
	StatusCode int
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("llm http %d: %s", e.StatusCode, truncate(e.Body, 300))
}

// ContextLengthExceeded 报告该错误是否由“提示超出上下文窗口”引起。
func (e *APIError) ContextLengthExceeded() bool {
	return isContextLengthText(e.Body)
}

// contextLengthError 用于服务端在 200 响应或流式块中返回的上下文超限错误。
type contextLengthError struct {
	message string
}

func (e *contextLengthError) Error() string { return e.message }

// IsContextLengthExceeded 判断 err 是否表示提示超出模型上下文窗口。
// 调用方据此裁剪历史后重试，而不是原样重试。
func IsContextLengthExceeded(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.ContextLengthExceeded()
	}
	var ctxErr *contextLengthError
	return errors.As(err, &ctxErr)
}

// contextLengthPhrases 取自各 OpenAI 兼容服务端的常见报错文案。
var contextLengthPhrases = []string{
	"maximum context length",
	"context_length_exceeded",
	"exceeds the available context size",
	"exceed_context_size_error",
	"context window",
	"prompt is too long",
	"too many tokens",
}

func isContextLengthText(text string) bool {
	lower := strings.ToLower(text)
	for _, phrase := range contextLengthPhrases {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	return false
}

// providerMessageError 把服务端返回的错误消息转换为可分类的错误。
func providerMessageError(message string) error {
	if isContextLengthText(message) {
		return &contextLengthError{message: message}
	}
	return errors.New(message)
}

// IsToolsUnsupported 判断错误是否因为服务端/模型不支持 function calling。
// 调用方可据此去掉 tools 重试，以兼容只支持纯文本补全的模型。
func IsToolsUnsupported(err error) bool {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	switch apiErr.StatusCode {
	case http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusNotImplemented:
	default:
		return false
	}
	lower := strings.ToLower(apiErr.Body)
	for _, phrase := range []string{"tool", "function calling", "function_call", "functions"} {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	return false
}

// ModelConfig 是 OpenAI 兼容接口配置。两个字段均来自前端：用户在
// APIKey 页面自行添加模型与 base URL，后端不保存预设列表。
type ModelConfig struct {
	Model string `json:"model"`
	URL   string `json:"url"`
}

// ResolveRequest 将前端传入的模型 id 与 base URL 转为接口配置，
// 除裁剪空白外不做其他改动。
func ResolveRequest(name, baseURL string) ModelConfig {
	return ModelConfig{
		Model: strings.TrimSpace(name),
		URL:   strings.TrimSpace(baseURL),
	}
}

// Message 遵循 OpenAI chat completion 的结构。
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
	// FinishReason 仅用于记录模型停止原因（stop/length/tool_calls），
	// 不参与回传给服务端的请求体。
	FinishReason string `json:"-"`
}

type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function ToolCallFunction `json:"function"`
}

type ToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Tool 是 OpenAI function 工具声明。
type Tool struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

func FuncTool(name, description string, parameters map[string]any) Tool {
	return Tool{
		Type:     "function",
		Function: ToolFunction{Name: name, Description: description, Parameters: parameters},
	}
}

// Client 与 OpenAI 兼容的 /chat/completions 接口通信。
type Client struct {
	BaseURL     string
	APIKey      string
	Model       string
	Temperature float64
	HTTP        *http.Client
}

func NewClient(cfg ModelConfig, apiKey, model string, temperature float64) *Client {
	if model == "" {
		model = cfg.Model
	}
	return &Client{
		BaseURL:     strings.TrimRight(cfg.URL, "/"),
		APIKey:      apiKey,
		Model:       model,
		Temperature: temperature,
		HTTP:        defaultHTTPClient,
	}
}

type chatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream"`
	Temperature float64   `json:"temperature"`
	Tools       []Tool    `json:"tools,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message Message `json:"message"`
		Finish  string  `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content   string `json:"content"`
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Type     string `json:"type"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
		Finish string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) buildBody(messages []Message, tools []Tool, stream bool) ([]byte, error) {
	return json.Marshal(chatRequest{
		Model:       c.Model,
		Messages:    messages,
		Stream:      stream,
		Temperature: c.Temperature,
		Tools:       tools,
	})
}

// requestHeaders 返回单次 AI 请求的请求头。集中在此便于请求发送与调试日志
// 使用完全相同的头。
func (c *Client) requestHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Content-Type", "application/json")
	headers.Set("Accept", "text/event-stream, application/json")
	headers.Set("User-Agent", "memo-agent/1.0")
	headers.Set("Authorization", "Bearer "+c.APIKey)
	if strings.Contains(c.BaseURL, "openrouter.ai") {
		headers.Set("HTTP-Referer", "https://localhost")
		headers.Set("X-Title", "memo")
	}
	return headers
}

func (c *Client) newRequest(ctx context.Context, body []byte) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header = c.requestHeaders()
	return req, nil
}

// do 发送请求，并对限流 / 5xx / 网络错误做有限次数的指数退避重试。
// 流式请求只在拿到响应头之前重试，避免重复已经输出给用户的文本。
func (c *Client) do(ctx context.Context, body []byte) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt < maxLLMAttempts; attempt++ {
		if attempt > 0 {
			delay := time.Duration(200*(1<<uint(attempt-1))) * time.Millisecond
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}
		req, err := c.newRequest(ctx, body)
		if err != nil {
			return nil, err
		}
		resp, err := c.HTTP.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			lastErr = err
			if attempt < maxLLMAttempts-1 {
				continue
			}
			return nil, err
		}

		if resp.StatusCode >= 400 {
			raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxLLMErrorBody))
			_ = resp.Body.Close()
			apiErr := &APIError{StatusCode: resp.StatusCode, Body: string(raw)}
			if attempt < maxLLMAttempts-1 && isRetryableStatus(resp.StatusCode) {
				lastErr = apiErr
				continue
			}
			return nil, apiErr
		}
		return resp, nil
	}
	return nil, lastErr
}

func isRetryableStatus(status int) bool {
	switch status {
	case http.StatusRequestTimeout, http.StatusConflict, http.StatusTooManyRequests:
		return true
	default:
		return status >= 500
	}
}

// Chat 执行非流式补全。
func (c *Client) Chat(ctx context.Context, messages []Message, tools []Tool) (*Message, error) {
	body, err := c.buildBody(messages, tools, false)
	if err != nil {
		return nil, err
	}
	resp, err := c.do(ctx, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBody))
	if err != nil {
		return nil, err
	}
	return parseBuffered(string(raw), nil)
}

// Stream 执行流式补全。onDelta 对每个文本片段调用。
// 返回累积后的 assistant 消息（内容 + 工具调用）。
//
// 某些 OpenAI 兼容服务端会忽略 stream=true 直接返回完整 JSON；这里在读到
// 首个非 SSE 数据时回退为缓冲解析，因此调用方无需区分两种服务端。
func (c *Client) Stream(ctx context.Context, messages []Message, tools []Tool, onDelta func(string)) (*Message, error) {
	body, err := c.buildBody(messages, tools, true)
	if err != nil {
		return nil, err
	}
	resp, err := c.do(ctx, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return readStream(ctx, resp.Body, onDelta)
}

// readStream 解析 SSE 流；若响应体并非 SSE，则回退为一次性 JSON 解析。
func readStream(ctx context.Context, r io.Reader, onDelta func(string)) (*Message, error) {
	reader := bufio.NewReaderSize(r, 64<<10)
	toolCalls := map[int]*ToolCall{}
	var toolOrder []int
	var content strings.Builder
	var buffered strings.Builder
	sawData := false
	sawSSE := false
	finishReason := ""

	handleData := func(data string) error {
		data = strings.TrimSpace(data)
		if data == "" || data == "[DONE]" {
			return nil
		}
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return nil
		}
		if chunk.Error != nil {
			return providerMessageError(chunk.Error.Message)
		}
		for _, choice := range chunk.Choices {
			if choice.Finish != "" {
				finishReason = choice.Finish
			}
			if choice.Delta.Content != "" {
				content.WriteString(choice.Delta.Content)
				if onDelta != nil {
					onDelta(choice.Delta.Content)
				}
			}
			for _, tc := range choice.Delta.ToolCalls {
				idx := tc.Index
				existing, ok := toolCalls[idx]
				if !ok {
					existing = &ToolCall{ID: tc.ID, Type: tc.Type, Function: ToolCallFunction{Name: tc.Function.Name}}
					toolCalls[idx] = existing
					toolOrder = append(toolOrder, idx)
				}
				if tc.ID != "" {
					existing.ID = tc.ID
				}
				if tc.Type != "" {
					existing.Type = tc.Type
				}
				if tc.Function.Name != "" {
					existing.Function.Name = tc.Function.Name
				}
				existing.Function.Arguments += tc.Function.Arguments
			}
		}
		return nil
	}

	for {
		line, readErr := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		streamDone := false
		switch {
		case strings.HasPrefix(line, "data:"):
			sawData = true
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				streamDone = true
				break
			}
			if err := handleData(data); err != nil {
				return nil, err
			}
		case line == "":
			// SSE 事件分隔空行。
		case strings.HasPrefix(line, "event:") || strings.HasPrefix(line, ":"):
			sawSSE = true
		case !sawData && !sawSSE:
			// 尚未出现 SSE 标记：可能是完整 JSON 响应（部分服务端忽略 stream）。
			buffered.WriteString(line)
			buffered.WriteString("\n")
		}

		if streamDone {
			break
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return nil, readErr
		}
	}

	if !sawData && !sawSSE && strings.TrimSpace(buffered.String()) != "" {
		return parseBuffered(buffered.String(), onDelta)
	}

	msg := &Message{Role: "assistant", Content: content.String(), FinishReason: finishReason}
	for _, idx := range toolOrder {
		if tc, ok := toolCalls[idx]; ok {
			if tc.Type == "" {
				tc.Type = "function"
			}
			msg.ToolCalls = append(msg.ToolCalls, *tc)
		}
	}
	return msg, nil
}

// parseBuffered 解析完整的 chat/completions JSON 响应，并在需要时把文本作为
// 单个增量回调给调用方（保证流式消费者对缓冲服务端也有输出）。
func parseBuffered(raw string, onDelta func(string)) (*Message, error) {
	var parsed chatResponse
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, fmt.Errorf("invalid response: %s", truncate(raw, 300))
	}
	if parsed.Error != nil {
		return nil, providerMessageError(parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}
	msg := parsed.Choices[0].Message
	msg.FinishReason = parsed.Choices[0].Finish
	if msg.Content != "" && onDelta != nil {
		onDelta(msg.Content)
	}
	return &msg, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// WithTimeout 返回绑定指定超时的 context（流式调用不设超时，
// 以免长内容生成被截断）。
func WithTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, d)
}
