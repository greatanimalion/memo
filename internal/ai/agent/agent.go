package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"unicode/utf8"

	"memo/internal/ai/llm"
)

// Agent 循环的通用能力：上下文预算、工具执行隔离与结果裁剪。
// 这些 helper 借鉴了 phero 的 EstimateTokens / clipToolResults /
// runToolCalls 设计，用于避免长对话撑爆上下文和单个工具拖垮整轮运行。

const (
	// charsPerToken 与 phero 的粗略估算一致：约 4 个字符 = 1 token。
	charsPerToken = 4
	// messageOverheadTokens 是每条消息的固定开销。
	messageOverheadTokens = 4
	// maxAgentInputTokens 是 Agent 单次请求的粗略 token 预算。超出时优先
	// 丢弃最旧的对话，只保留系统提示与最近消息。
	maxAgentInputTokens = 24_000
	// maxToolResultChars 限制回填给模型的单个工具结果大小。
	maxToolResultChars = 8_000
)

// estimateMessageTokens 粗略估算一条消息的 token 数。
func estimateMessageTokens(m llm.Message) int {
	chars := len(m.Content)
	for _, tc := range m.ToolCalls {
		chars += len(tc.Function.Name) + len(tc.Function.Arguments)
	}
	return chars/charsPerToken + messageOverheadTokens
}

// estimateMessagesTokens 粗略估算整组消息的 token 数。
func estimateMessagesTokens(messages []llm.Message) int {
	total := 0
	for _, m := range messages {
		total += estimateMessageTokens(m)
	}
	return total
}

// trimMessages 在超出 token 预算时丢弃最旧的历史消息。它始终保留首条
// system 消息，并且不会让截断后的序列以 role=tool 开头（否则会破坏
// OpenAI 协议中 tool 消息必须紧跟 tool_calls 的要求）。
func trimMessages(messages []llm.Message, maxTokens int) []llm.Message {
	if maxTokens <= 0 || len(messages) == 0 || estimateMessagesTokens(messages) <= maxTokens {
		return messages
	}

	system := messages[0]
	rest := messages[1:]

	used := estimateMessageTokens(system)
	start := len(rest)
	for i := len(rest) - 1; i >= 0; i-- {
		tokens := estimateMessageTokens(rest[i])
		if used+tokens > maxTokens && start < len(rest) {
			break
		}
		used += tokens
		start = i
	}
	for start < len(rest) && rest[start].Role == "tool" {
		start++
	}

	out := make([]llm.Message, 0, 1+len(rest)-start)
	out = append(out, system)
	out = append(out, rest[start:]...)
	return out
}

// clipText 把过长文本压缩为“开头 + 结尾”，保留足够上下文又不无限膨胀。
func clipText(s string, limit int) string {
	if limit <= 0 || len(s) <= limit {
		return s
	}
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	half := limit / 2
	cut := len(runes) - 2*half
	return string(runes[:half]) + fmt.Sprintf("\n[... %d 字符已截断 ...]\n", cut) + string(runes[len(runes)-half:])
}

// tailText 返回文本末尾最多 limit 个字符。
func tailText(s string, limit int) string {
	if limit <= 0 || len(s) <= limit {
		return s
	}
	return s[len(s)-limit:]
}

// toolOutcome 是一次工具调用的结果。
type toolOutcome struct {
	Result string
	Err    error
}

// executeToolSafely 执行一次工具调用，并把 panic 转换为错误，使单个工具的
// 缺陷不会导致整个进程崩溃。
func executeToolSafely(name, arguments string) (result string, err error) {
	defer func() {
		if r := recover(); r != nil {
			result, err = "", fmt.Errorf("tool %s panicked: %v", name, r)
		}
	}()
	return executeTool(name, arguments)
}

// runToolCallsConcurrently 并发执行同一轮的多个工具调用，结果保持调用顺序。
// ctx 取消时，未开始的调用直接返回取消错误；已有的本地工具不受影响。
func runToolCallsConcurrently(ctx context.Context, calls []llm.ToolCall, exec func(llm.ToolCall) (string, error)) []toolOutcome {
	outcomes := make([]toolOutcome, len(calls))
	var wg sync.WaitGroup
	for i := range calls {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := ctx.Err(); err != nil {
				outcomes[i] = toolOutcome{Err: err}
				return
			}
			result, err := exec(calls[i])
			outcomes[i] = toolOutcome{Result: result, Err: err}
		}(i)
	}
	wg.Wait()
	return outcomes
}

// formatToolError 将工具错误渲染为模型可理解、可自我修正的文本。
func formatToolError(err error) string {
	return fmt.Sprintf("Error: %s\n Please fix your mistakes.", err)
}

// isBlank 报告字符串是否只有空白。
func isBlank(s string) bool {
	return strings.TrimSpace(s) == ""
}

// runeLen 返回字符串的 Unicode 码点数量。
func runeLen(s string) int {
	return utf8.RuneCountInString(s)
}
