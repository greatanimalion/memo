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

// ModelConfig maps a model name coming from the frontend to the OpenAI
// compatible endpoint to use (mirrors the previous getModels()/ai.config.ts).
type ModelConfig struct {
	Model string `json:"model"`
	URL   string `json:"url"`
}

var modelRegistry = map[string]ModelConfig{
	"qwen-plus":         {Model: "qwen-plus", URL: "https://dashscope.aliyuncs.com/compatible-mode/v1"},
	"glm-5.1":           {Model: "glm-5.1", URL: "https://open.bigmodel.cn/api/paas/v4"},
	"deepseek":          {Model: "deepseek-chat", URL: "https://api.deepseek.com"},
	"deepseek-v4-flash": {Model: "deepseek-chat", URL: "https://api.deepseek.com"},
	"openRouter":        {Model: "openai/gpt-5.2", URL: "https://openrouter.ai/api/v1"},
}

// ResolveModel returns the endpoint configuration for a frontend model name.
func ResolveModel(name string) ModelConfig {
	if cfg, ok := modelRegistry[name]; ok {
		return cfg
	}
	return ModelConfig{Model: "qwen-plus", URL: "https://dashscope.aliyuncs.com/compatible-mode/v1"}
}

// Message follows the OpenAI chat completion shape.
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

// Tool is an OpenAI function tool declaration.
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

// Client talks to an OpenAI compatible /chat/completions endpoint.
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

// Chat performs a non streaming completion (used for the agent tool loop).
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

// Stream performs a streaming completion. onDelta is invoked for every text
// fragment. The accumulated assistant message (content + tool calls) is
// returned.
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

// WithTimeout returns a context bound to the given timeout (streaming calls
// use no timeout so long generations are not cut off).
func WithTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, d)
}
