package ai

import (
	"bytes"
	crand "crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
)

// ──────────────────── JS 兼容字符串辅助函数 ────────────────────

// jsLen 对应 JavaScript 的 String#length（UTF-16 码元）。
func jsLen(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// jsSlice 使用 UTF-16 索引对应 String#slice。
func jsSlice(s string, start, end int) string {
	u := utf16.Encode([]rune(s))
	if start < 0 {
		start = 0
	}
	if end > len(u) {
		end = len(u)
	}
	if start >= end {
		return ""
	}
	return string(utf16.Decode(u[start:end]))
}

func toInt64(v any) int64 {
	switch n := v.(type) {
	case int:
		return int64(n)
	case int64:
		return n
	case float64:
		return int64(n)
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return i
		}
	}
	return 0
}

func toString(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case nil:
		return ""
	default:
		return fmt.Sprint(s)
	}
}

// marshalNoHTML 序列化 JSON 时不对 <、> 和 & 转义（此前的
// 服务端逐字存储对话消息）。
func marshalNoHTML(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func randInt(n int) int {
	if n <= 0 {
		return 0
	}
	v, err := crand.Int(crand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(v.Int64())
}

// ──────────────────── 纯文本回退解析（对应 dsml.ts） ────────────────────

var (
	bookAgentJSONCallRe   = regexp.MustCompile(`(?i)([A-Za-z0-9_]+)\s*\(\s*(\{[^}]+\})\s*\)`)
	bookAgentSimpleCallRe = regexp.MustCompile(`(?i)(?:\x{8C03}\x{7528}|call|invoke)\s+[\x60"']?([A-Za-z0-9_]+)[\x60"']?\s*(?:\x{5DE5}\x{5177}|tool)?`)
	bookAgentBookIDRe     = regexp.MustCompile(`(?i)\x{4E66}\x{7C4D}ID[\x{FF1A}:]\s*[\x60"']?([a-f0-9-]+)`)
	bookAgentTargetRe     = regexp.MustCompile(`(?i)(?:\x{76EE}\x{6807}|target)[\x{FF1A}:]\s*[\x60"']?([A-Za-z0-9_]+)`)
)

// parseTextToolCalls 处理以纯文本形式输出工具调用的模型。
func parseTextToolCalls(content string) []bookToolCall {
	calls := []bookToolCall{}

	for _, match := range bookAgentJSONCallRe.FindAllStringSubmatch(content, -1) {
		name := match[1]
		args := map[string]any{}
		if err := json.Unmarshal([]byte(match[2]), &args); err != nil {
			continue
		}
		calls = append(calls, bookToolCall{Name: name, Args: args, ID: dsmlCallID("text")})
	}

	if len(calls) == 0 {
		for _, match := range bookAgentSimpleCallRe.FindAllStringSubmatch(content, -1) {
			name := strings.ToLower(match[1])
			args := inferToolArgs(name, content)
			if args != nil {
				calls = append(calls, bookToolCall{Name: name, Args: args, ID: dsmlCallID("text")})
			}
		}
	}

	return calls
}

// inferToolArgs 对应 inferToolArgs()：nil 表示“无法推断，跳过”。
func inferToolArgs(toolName, content string) map[string]any {
	switch toolName {
	case "get_book_info":
		if m := bookAgentBookIDRe.FindStringSubmatch(content); m != nil {
			return map[string]any{"bookId": m[1]}
		}
		return map[string]any{}
	case "route":
		if m := bookAgentTargetRe.FindStringSubmatch(content); m != nil {
			return map[string]any{"target": m[1]}
		}
		return nil
	default:
		return nil
	}
}

var _ = strconv.Atoi
