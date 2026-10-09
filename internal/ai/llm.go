package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

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
		HTTP:        &http.Client{},
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

func (c *Client) newRequest(ctx context.Context, body []byte) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	if strings.Contains(c.BaseURL, "openrouter.ai") {
		req.Header.Set("HTTP-Referer", "https://localhost")
		req.Header.Set("X-Title", "memo")
	}
	return req, nil
}

// Chat 执行非流式补全（用于 Agent 工具循环）。
func (c *Client) Chat(ctx context.Context, messages []Message, tools []Tool) (*Message, error) {
	body, err := c.buildBody(messages, tools, false)
	if err != nil {
		return nil, err
	}
	req, err := c.newRequest(ctx, body)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("invalid response: %s", truncate(string(raw), 300))
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("%s", parsed.Error.Message)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("llm http %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}
	msg := parsed.Choices[0].Message
	if msg.Content == "" && len(msg.ToolCalls) == 0 {
		msg.Content = ""
	}
	return &msg, nil
}

// Stream 执行流式补全。onDelta 对每个文本片段调用。
// 返回累积后的 assistant 消息（内容 + 工具调用）。
func (c *Client) Stream(ctx context.Context, messages []Message, tools []Tool, onDelta func(string)) (*Message, error) {
	body, err := c.buildBody(messages, tools, true)
	if err != nil {
		return nil, err
	}
	req, err := c.newRequest(ctx, body)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("llm http %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}

	toolCalls := map[int]*ToolCall{}
	var content strings.Builder

	reader := bufio.NewReader(resp.Body)
	for {
		line, readErr := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, "data:") {
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				break
			}
			if data == "" {
				continue
			}
			var chunk streamChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}
			if chunk.Error != nil {
				return nil, fmt.Errorf("%s", chunk.Error.Message)
			}
			for _, choice := range chunk.Choices {
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
					}
					if tc.ID != "" {
						existing.ID = tc.ID
					}
					if tc.Function.Name != "" {
						existing.Function.Name = tc.Function.Name
					}
					existing.Function.Arguments += tc.Function.Arguments
				}
			}
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

	msg := &Message{Role: "assistant", Content: content.String()}
	if len(toolCalls) > 0 {
		max := 0
		for idx := range toolCalls {
			if idx+1 > max {
				max = idx + 1
			}
		}
		for i := 0; i < max; i++ {
			if tc, ok := toolCalls[i]; ok {
				if tc.Type == "" {
					tc.Type = "function"
				}
				msg.ToolCalls = append(msg.ToolCalls, *tc)
			}
		}
	}
	return msg, nil
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
