package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"net/http"
	"strconv"
	"strings"
	"time"

	"memo/internal/ai/config"
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

// Client 与 OpenAI 兼容的 /chat/completions 接口通信。
type Client struct {
	BaseURL     string
	APIKey      string
	Model       string
	Temperature float64
	HTTP        *http.Client
}

// NewClient 依据模型配置创建 OpenAI 兼容客户端。
func NewClient(cfg config.ModelConfig, apiKey, model string, temperature float64) *Client {
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
	// MaxTokens 对应 WithMaxOutputTokens；0 表示不限制（保持原有请求体不变）。
	MaxTokens int `json:"max_tokens,omitempty"`
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

func (c *Client) buildBody(messages []Message, tools []Tool, maxTokens int, stream bool) ([]byte, error) {
	return json.Marshal(chatRequest{
		Model:       c.Model,
		Messages:    messages,
		Stream:      stream,
		Temperature: c.Temperature,
		Tools:       tools,
		MaxTokens:   maxTokens,
	})
}

// RequestHeaders 返回单次 AI 请求的请求头，供调试日志复用。
func (c *Client) RequestHeaders() http.Header {
	return c.requestHeaders()
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
			// 按 phero 的做法把服务端 HTTP 错误统一包装为 ProviderError，
			// 错误文本保持 APIError 原文不变，便于用 errors.Is/As 分类。
			providerErr := &ProviderError{
				Provider:              "openai",
				StatusCode:            resp.StatusCode,
				RetryAfter:            parseRetryAfter(resp.Header),
				ContextLengthExceeded: apiErr.ContextLengthExceeded(),
				Err:                   apiErr,
			}
			if attempt < maxLLMAttempts-1 && isRetryableStatus(resp.StatusCode) {
				lastErr = providerErr
				continue
			}
			return nil, providerErr
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

// parseRetryAfter 解析 Retry-After 头（秒数形式），无法解析时返回 0。
func parseRetryAfter(header http.Header) time.Duration {
	value := strings.TrimSpace(header.Get("Retry-After"))
	if value == "" {
		return 0
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

// Chat 执行非流式补全。
func (c *Client) Chat(ctx context.Context, messages []Message, tools []Tool) (*Message, error) {
	return c.chat(ctx, messages, tools, 0)
}

// chat 是非流式补全的内部实现，maxTokens 为 0 时不限制输出长度。
func (c *Client) chat(ctx context.Context, messages []Message, tools []Tool, maxTokens int) (*Message, error) {
	body, err := c.buildBody(messages, tools, maxTokens, false)
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
	return c.stream(ctx, messages, tools, 0, onDelta)
}

// stream 是流式补全的内部实现，maxTokens 为 0 时不限制输出长度。
func (c *Client) stream(ctx context.Context, messages []Message, tools []Tool, maxTokens int, onDelta func(string)) (*Message, error) {
	body, err := c.buildBody(messages, tools, maxTokens, true)
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

// resolveCall 解析并校验单次调用选项。本后端只支持工具列表与输出长度上限，
// 无法满足的工具选择模式会显式报错而不是静默忽略。
func (c *Client) resolveCall(opts ...CallOption) (*CallConfig, error) {
	cfg := NewCallConfig(opts...)
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cfg.ToolChoice != nil {
		switch cfg.ToolChoice.Mode {
		case ToolChoiceAuto:
		case ToolChoiceNone:
			cfg.Tools = nil
		default:
			return nil, fmt.Errorf("%w: tool choice %q", ErrUnsupportedCallOption, cfg.ToolChoice.Mode)
		}
	}
	return cfg, nil
}

// Execute 实现 LLM 接口：一次非流式补全。
func (c *Client) Execute(ctx context.Context, messages []Message, opts ...CallOption) (*Result, error) {
	cfg, err := c.resolveCall(opts...)
	if err != nil {
		return nil, err
	}
	msg, err := c.chat(ctx, messages, cfg.Tools, cfg.MaxOutputTokens)
	if err != nil {
		return nil, err
	}
	return &Result{
		Message:         msg,
		Model:           c.Model,
		FinishReason:    msg.FinishReason,
		RawFinishReason: string(msg.FinishReason),
	}, nil
}

// ExecuteStream 实现 StreamingLLM 接口：文本以 TextDelta 增量产出，
// 工具调用在流结束后逐条产出，最后产出 Done 为 true 的终止块。
func (c *Client) ExecuteStream(ctx context.Context, messages []Message, opts ...CallOption) iter.Seq2[StreamChunk, error] {
	return func(yield func(StreamChunk, error) bool) {
		cfg, err := c.resolveCall(opts...)
		if err != nil {
			yield(StreamChunk{}, err)
			return
		}

		ctx, cancel := context.WithCancel(ctx)
		defer cancel()

		stopped := false
		msg, err := c.stream(ctx, messages, cfg.Tools, cfg.MaxOutputTokens, func(delta string) {
			if stopped || delta == "" {
				return
			}
			if !yield(StreamChunk{TextDelta: delta}, nil) {
				// 消费方提前结束：取消底层请求，避免继续读取响应体。
				stopped = true
				cancel()
			}
		})
		if stopped {
			return
		}
		if err != nil {
			yield(StreamChunk{}, err)
			return
		}
		for i := range msg.ToolCalls {
			if !yield(StreamChunk{ToolCall: &msg.ToolCalls[i]}, nil) {
				return
			}
		}
		yield(StreamChunk{
			Message:         msg,
			Model:           c.Model,
			FinishReason:    msg.FinishReason,
			RawFinishReason: string(msg.FinishReason),
			Done:            true,
		}, nil)
	}
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

	msg := &Message{Role: "assistant", Content: content.String(), FinishReason: FinishReason(finishReason)}
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
	msg.FinishReason = FinishReason(parsed.Choices[0].Finish)
	if msg.Content != "" && onDelta != nil {
		onDelta(msg.Content)
	}
	return &msg, nil
}
