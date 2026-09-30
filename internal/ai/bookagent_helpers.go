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

// ──────────────────── JS compatible string helpers ────────────────────

// jsLen mirrors JavaScript's String#length (UTF-16 code units).
func jsLen(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// jsSlice mirrors String#slice using UTF-16 indexes.
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

// marshalNoHTML serialises JSON without escaping <, > and & (the previous
// server stored conversation messages verbatim).
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

// ──────────────────── Text fallback parsing (mirrors dsml.ts) ────────────────────

var (
	bookAgentJSONCallRe   = regexp.MustCompile(`(?i)([A-Za-z0-9_]+)\s*\(\s*(\{[^}]+\})\s*\)`)
	bookAgentSimpleCallRe = regexp.MustCompile(`(?i)(?:\x{8C03}\x{7528}|call|invoke)\s+[\x60"']?([A-Za-z0-9_]+)[\x60"']?\s*(?:\x{5DE5}\x{5177}|tool)?`)
	bookAgentBookIDRe     = regexp.MustCompile(`(?i)\x{4E66}\x{7C4D}ID[\x{FF1A}:]\s*[\x60"']?([a-f0-9-]+)`)
	bookAgentTargetRe     = regexp.MustCompile(`(?i)(?:\x{76EE}\x{6807}|target)[\x{FF1A}:]\s*[\x60"']?([A-Za-z0-9_]+)`)
)

// parseTextToolCalls handles models that emit tool calls as plain text.
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

// inferToolArgs mirrors inferToolArgs(): nil means "cannot infer, skip".
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
