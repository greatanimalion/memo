package llm

import (
	"context"
	"errors"
	"fmt"
	"io"
	"iter"
	"net"
	"net/http"
	"strings"
	"time"
)

// Chatter 是 LLM 客户端的统一接口：既支持一次性补全，也支持流式补全。
type Chatter interface {
	Chat(ctx context.Context, messages []Message, tools []Tool) (*Message, error)
	Stream(ctx context.Context, messages []Message, tools []Tool, onDelta func(string)) (*Message, error)
}

// LLM 是聊天模型后端的最小接口（对应 phero 的 llm.LLM）：
// 每次调用的工具、工具选择等设置都通过 CallOption 传入，
// 因此新增设置项不需要改动接口本身。
type LLM interface {
	Execute(ctx context.Context, messages []Message, opts ...CallOption) (*Result, error)
}

// StreamingLLM 在 LLM 之上增加流式能力（对应 phero 的 llm.StreamingLLM）。
type StreamingLLM interface {
	LLM
	// ExecuteStream 返回响应分块的迭代器。最后一块 Done 为 true，
	// 并携带完整消息；流式失败时迭代器产出一个 error 后结束。
	ExecuteStream(ctx context.Context, messages []Message, opts ...CallOption) iter.Seq2[StreamChunk, error]
}

// Func 把普通函数适配为 LLM，便于编写中间件与测试替身。
type Func func(ctx context.Context, messages []Message, opts ...CallOption) (*Result, error)

// Execute 调用 f。
func (f Func) Execute(ctx context.Context, messages []Message, opts ...CallOption) (*Result, error) {
	return f(ctx, messages, opts...)
}

// Usage 是单次调用的 token 消耗统计。
type Usage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
}

// Result 是一次 LLM 执行的结果（对应 phero 的 llm.Result）。
type Result struct {
	Message *Message
	// Usage 在服务端未返回用量信息时为空。
	Usage *Usage
	// Model 是实际产生结果的模型名。
	Model string
	// FinishReason 是归一化后的停止原因。
	FinishReason FinishReason
	// RawFinishReason 是服务端返回的原始停止原因。
	RawFinishReason string
}

// StreamChunk 是流式响应中的一个增量分块（对应 phero 的 llm.StreamChunk）。
// 调用方累积 TextDelta 做实时展示，并从 Done 为 true 的终止块读取完整消息。
type StreamChunk struct {
	// TextDelta 是增量文本，非文本分块为空。
	TextDelta string
	// ToolCall 是组装完成的工具调用，仅在工具调用分块中出现。
	ToolCall *ToolCall
	// Message 是完整组装的 assistant 消息，仅在终止块中设置。
	Message *Message
	// Usage 仅在终止块中设置，且服务端返回用量信息时才有值。
	Usage *Usage
	// Model 仅在终止块中设置。
	Model string
	// FinishReason 仅在终止块中设置。
	FinishReason FinishReason
	// RawFinishReason 仅在终止块中设置。
	RawFinishReason string
	// Done 表明这是流的终止块。
	Done bool
}

// CallOption 配置单次 LLM 调用（对应 phero 的 llm.CallOption）。
type CallOption func(*CallConfig)

// ToolChoiceMode 选择模型使用工具的方式。
type ToolChoiceMode string

const (
	// ToolChoiceAuto 由模型自行决定是否调用工具（服务端默认行为）。
	ToolChoiceAuto ToolChoiceMode = "auto"
	// ToolChoiceNone 禁止工具调用，模型必须直接回答。
	ToolChoiceNone ToolChoiceMode = "none"
	// ToolChoiceRequired 强制模型至少调用一个工具。
	ToolChoiceRequired ToolChoiceMode = "required"
	// ToolChoiceTool 强制模型调用 ToolChoice.Name 指定的工具。
	ToolChoiceTool ToolChoiceMode = "tool"
)

// ToolChoice 是一次调用解析后的工具选择设置。
type ToolChoice struct {
	Mode ToolChoiceMode `json:"mode"`
	// Name 在 Mode 为 ToolChoiceTool 时为被强制的工具名。
	Name string `json:"name,omitempty"`
}

// CallConfig 是一次调用选项解析后的结果。
type CallConfig struct {
	// Tools 是本次调用可用的工具声明。
	Tools []Tool
	// ToolChoice 约束工具使用方式；nil 表示沿用服务端默认（auto）。
	ToolChoice *ToolChoice
	// MaxOutputTokens 限制本次调用的输出 token 数；0 表示使用客户端设置。
	MaxOutputTokens int
}

// NewCallConfig 按顺序应用 opts，忽略 nil 选项。
func NewCallConfig(opts ...CallOption) *CallConfig {
	cfg := &CallConfig{}
	for _, opt := range opts {
		if opt != nil {
			opt(cfg)
		}
	}
	return cfg
}

// Validate 检查配置自洽性：工具选择模式合法，且被强制的工具确实在本次提供。
func (c *CallConfig) Validate() error {
	if c.ToolChoice == nil {
		return nil
	}
	switch c.ToolChoice.Mode {
	case ToolChoiceAuto, ToolChoiceNone:
		return nil
	case ToolChoiceRequired:
		if len(c.Tools) == 0 {
			return fmt.Errorf("%w: %q 至少需要一个工具", ErrInvalidToolChoice, c.ToolChoice.Mode)
		}
		return nil
	case ToolChoiceTool:
		if c.ToolChoice.Name == "" {
			return fmt.Errorf("%w: 强制工具缺少名称", ErrInvalidToolChoice)
		}
		for _, tool := range c.Tools {
			if tool.Function.Name == c.ToolChoice.Name {
				return nil
			}
		}
		return fmt.Errorf("%w: 强制工具 %q 未在本次调用中提供", ErrInvalidToolChoice, c.ToolChoice.Name)
	default:
		return fmt.Errorf("%w: 未知模式 %q", ErrInvalidToolChoice, c.ToolChoice.Mode)
	}
}

// WithTools 为本次调用提供工具；可多次传入，nil 工具会被忽略。
func WithTools(tools ...Tool) CallOption {
	return func(c *CallConfig) {
		for _, tool := range tools {
			if tool.Function.Name != "" {
				c.Tools = append(c.Tools, tool)
			}
		}
	}
}

// WithToolChoice 设置模型使用工具的方式。
func WithToolChoice(mode ToolChoiceMode) CallOption {
	return func(c *CallConfig) {
		c.ToolChoice = &ToolChoice{Mode: mode}
	}
}

// WithForcedTool 强制模型调用指定名称的工具，该工具必须同时通过 WithTools 提供。
func WithForcedTool(name string) CallOption {
	return func(c *CallConfig) {
		c.ToolChoice = &ToolChoice{Mode: ToolChoiceTool, Name: name}
	}
}

// WithMaxOutputTokens 限制本次调用的输出 token 数；小于等于 0 表示不限制。
func WithMaxOutputTokens(n int) CallOption {
	return func(c *CallConfig) {
		if n < 0 {
			n = 0
		}
		c.MaxOutputTokens = n
	}
}

// FinishReason 是模型停止生成的原因（对应 phero 的 llm.FinishReason）。
type FinishReason string

// 原实现使用无类型字符串常量，保留备查：
// const (
//
//	FinishStop      = "stop"
//	FinishLength    = "length"
//	FinishToolCalls = "tool_calls"
//
// )
const (
	FinishStop          FinishReason = "stop"
	FinishLength        FinishReason = "length"
	FinishToolCalls     FinishReason = "tool_calls"
	FinishContentFilter FinishReason = "content_filter"
	FinishError         FinishReason = "error"
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
	if errors.Is(err, ErrContextLengthExceeded) {
		return true
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

// Message 遵循 OpenAI chat completion 的结构。
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
	// FinishReason 仅用于记录模型停止原因（stop/length/tool_calls），
	// 不参与回传给服务端的请求体。原实现为 string 类型，保留备查。
	FinishReason FinishReason `json:"-"`
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

// FuncTool 构造一个 OpenAI function 工具声明。
func FuncTool(name, description string, parameters map[string]any) Tool {
	return Tool{
		Type:     "function",
		Function: ToolFunction{Name: name, Description: description, Parameters: parameters},
	}
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

// ──────────────────── 错误分类（对应 phero 的 llm/errors.go） ────────────────────

var (
	// ErrContextLengthExceeded 表示提示超出模型上下文窗口：重试同一请求
	// 不会成功，必须先缩短对话。
	ErrContextLengthExceeded = errors.New("context length exceeded")
	// ErrGuardrailBlocked 表示模型调用被护栏拦截。
	ErrGuardrailBlocked = errors.New("guardrail blocked the call")
	// ErrInvalidToolChoice 表示工具选择配置不自洽。
	ErrInvalidToolChoice = errors.New("invalid tool choice")
	// ErrUnsupportedCallOption 表示后端无法满足传入的调用选项，
	// 此时应显式报错而不是静默忽略。
	ErrUnsupportedCallOption = errors.New("call option not supported by this LLM")
)

// ProviderError 是服务端以 HTTP 状态码返回的错误（不依赖具体 SDK 的形态）。
// ProviderError 包装底层错误，Error 文本保持底层错误原文不变。
type ProviderError struct {
	// Provider 是提供方名称，本实现固定为 "openai"。
	Provider string
	// StatusCode 是服务端返回的 HTTP 状态码。
	StatusCode int
	// RetryAfter 是服务端建议的等待时长（通常来自 429），未知时为 0。
	RetryAfter time.Duration
	// ContextLengthExceeded 表示服务端因提示超出上下文窗口而拒绝请求，
	// 这类错误可用 errors.Is(err, ErrContextLengthExceeded) 匹配。
	ContextLengthExceeded bool
	// Err 是被包装的底层错误。
	Err error
}

func (e *ProviderError) Error() string { return e.Err.Error() }

func (e *ProviderError) Unwrap() error { return e.Err }

// Is 支持 errors.Is(err, ErrContextLengthExceeded)。
func (e *ProviderError) Is(target error) bool {
	return target == ErrContextLengthExceeded && e.ContextLengthExceeded
}

// IsRetryable 判断重试返回 err 的调用是否可能成功：限流、超时、
// 服务端 5xx 或网络错误可重试；参数错误、认证失败、上下文超限、
// 护栏拦截以及被取消的 context 不可重试。
func IsRetryable(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	if errors.Is(err, ErrContextLengthExceeded) || errors.Is(err, ErrGuardrailBlocked) {
		return false
	}

	var providerErr *ProviderError
	if errors.As(err, &providerErr) {
		return isRetryableStatus(providerErr.StatusCode)
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return isRetryableStatus(apiErr.StatusCode)
	}

	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	return errors.Is(err, io.ErrUnexpectedEOF)
}
