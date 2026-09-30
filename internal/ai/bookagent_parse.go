package ai

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ──────────────────── SSE payload shapes ────────────────────

type agentEvent struct {
	Name string `json:"name"`
}

type bookAgentToolCallEvent struct {
	Agent string `json:"agent"`
	Name  string `json:"name"`
}

// ──────────────────── DSML parsing (mirrors dsml.ts) ────────────────────

// dsmlBar is the fullwidth vertical bar used by DeepSeek's DSML markup.
const dsmlBar = "\uFF5C"

var (
	bookAgentDSMLTag  = dsmlBar + dsmlBar + "DSML" + dsmlBar + dsmlBar
	bookAgentInvokeRe = regexp.MustCompile(`(?s)<` + bookAgentDSMLTag + `invoke\s+name="([^"]+)">(.*?)</` + bookAgentDSMLTag + `invoke>`)
	bookAgentParamRe  = regexp.MustCompile(`<` + bookAgentDSMLTag + `parameter\s+name="([^"]+)"(\s+string="true")?>(.*?)</` + bookAgentDSMLTag + `parameter>`)
)

var bookAgentParamTypes = map[string]map[string]string{
	"get_book_info":  {"bookId": "string"},
	"save_chapter":   {"bookId": "string", "title": "string", "content": "string", "order": "number"},
	"update_chapter": {"chapterId": "string", "title": "string", "content": "string"},
	"route":          {"target": "string"},
}

func convertArgType(value, toolName, paramName string) any {
	types, ok := bookAgentParamTypes[toolName]
	if !ok {
		return inferScalar(value)
	}
	kind, ok := types[paramName]
	if !ok {
		return inferScalar(value)
	}
	switch kind {
	case "number":
		n, err := strconv.Atoi(value)
		if err != nil {
			return 0
		}
		return n
	case "boolean":
		return value == "true"
	default:
		return value
	}
}

func inferScalar(value string) any {
	if regexp.MustCompile(`^\d+$`).MatchString(value) {
		n, err := strconv.Atoi(value)
		if err == nil {
			return n
		}
	}
	if regexp.MustCompile(`^\d+\.\d+$`).MatchString(value) {
		f, err := strconv.ParseFloat(value, 64)
		if err == nil {
			return f
		}
	}
	if value == "true" {
		return true
	}
	if value == "false" {
		return false
	}
	return value
}

// parseDSMLToolCalls extracts DeepSeek DSML invoke blocks from the content.
func parseDSMLToolCalls(content string) []bookToolCall {
	calls := []bookToolCall{}
	start := 0
	for {
		loc := bookAgentInvokeRe.FindStringSubmatchIndex(content[start:])
		if loc == nil {
			break
		}
		relStart, relEnd := loc[0], loc[1]
		name := content[start+loc[2] : start+loc[3]]
		body := content[start+loc[4] : start+loc[5]]
		args := parseDSMLParams(body, name)
		calls = append(calls, bookToolCall{Name: name, Args: args, ID: dsmlCallID("dsml")})
		start += relEnd
		if relStart == relEnd {
			break
		}
	}
	return calls
}

func parseDSMLParams(body, toolName string) map[string]any {
	args := map[string]any{}
	matches := bookAgentParamRe.FindAllStringSubmatch(body, -1)
	for _, m := range matches {
		paramName := m[1]
		isString := m[2] != ""
		value := m[3]
		if isString {
			args[paramName] = value
		} else {
			args[paramName] = convertArgType(value, toolName, paramName)
		}
	}
	return args
}

func containsBookToolCall(calls []bookToolCall, candidate bookToolCall) bool {
	for _, c := range calls {
		if c.Name == candidate.Name && stringifyArgs(c.Args) == stringifyArgs(candidate.Args) {
			return true
		}
	}
	return false
}

// parseMessageToolCalls re-reads the tool calls stored on the assistant
// message produced by runAgent.
func parseMessageToolCalls(msg Message) []bookToolCall {
	calls := make([]bookToolCall, 0, len(msg.ToolCalls))
	for _, tc := range msg.ToolCalls {
		args := map[string]any{}
		if tc.Function.Arguments != "" {
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
		}
		calls = append(calls, bookToolCall{Name: tc.Function.Name, Args: args, ID: tc.ID})
	}
	return calls
}

func stringifyArgs(args map[string]any) string {
	if len(args) == 0 {
		return "{}"
	}
	raw, err := json.Marshal(args)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func dsmlCallID(prefix string) string {
	return fmt.Sprintf("%s_%d_%s", prefix, time.Now().UnixMilli(), randomSuffix())
}

func randomSuffix() string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[randInt(len(letters))]
	}
	return string(b)
}

var _ = strings.TrimSpace
