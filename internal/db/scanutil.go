package db

import (
	"bytes"
	"encoding/json"
	"strings"
)

// rowScanner 可由 *sql.Row 和 *sql.Rows 同时实现。
type rowScanner interface {
	Scan(dest ...any) error
}

// normalizeJSON 用给定的默认值（如 "[]" 或 "{}"）替换空的/NULL 文本列，
// 以确保 API 不会为 JSON 列返回裸 null。
func normalizeJSON(raw, def string) json.RawMessage {
	t := bytes.TrimSpace([]byte(raw))
	if len(t) == 0 || string(t) == "null" {
		return json.RawMessage(def)
	}
	return json.RawMessage(t)
}

// RawToString 将 JSON 标量折叠为 TEXT 列中存储的文本值：
// 字符串去掉引号，数字/布尔保留字面形式。
func RawToString(raw json.RawMessage) string {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || string(t) == "null" {
		return ""
	}
	if t[0] == '"' {
		var s string
		if json.Unmarshal(t, &s) == nil {
			return s
		}
	}
	return string(t)
}

// RawToNullableString 与 RawToString 类似，但将 JSON null 保留为 nil 指针，
// 以便调用方能够绑定 SQL NULL。
func RawToNullableString(raw json.RawMessage) *string {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || string(t) == "null" {
		return nil
	}
	if t[0] == '"' {
		var s string
		if json.Unmarshal(t, &s) == nil {
			return &s
		}
	}
	s := string(t)
	return &s
}

// RawToInt64 将 JSON 数字解码为 int64。
func RawToInt64(raw json.RawMessage) (int64, bool) {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 {
		return 0, false
	}
	var n json.Number
	if err := json.Unmarshal(t, &n); err != nil {
		return 0, false
	}
	if i, err := n.Int64(); err == nil {
		return i, true
	}
	if f, err := n.Float64(); err == nil {
		return int64(f), true
	}
	return 0, false
}

// buildQuotedUpdate 是 buildUpdate 的变体，但会为每个列名加上反引号
// （用于 `order` 等保留字）。无类型的 nil 值会被跳过；
// 带类型的 nil 指针会保留，以便绑定为 SQL NULL。
func buildQuotedUpdate(updates map[string]any, skip ...string) (string, []any) {
	skipped := map[string]bool{}
	for _, s := range skip {
		skipped[s] = true
	}
	fields := make([]string, 0, len(updates))
	args := make([]any, 0, len(updates))
	for key, value := range updates {
		if skipped[key] || !identifierRe.MatchString(key) {
			continue
		}
		if value == nil {
			continue
		}
		fields = append(fields, "`"+key+"` = ?")
		args = append(args, value)
	}
	if len(fields) == 0 {
		return "", nil
	}
	return strings.Join(fields, ", "), args
}
