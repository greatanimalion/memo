package db

import (
	"bytes"
	"encoding/json"
	"strings"
)

// rowScanner is satisfied by both *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

// normalizeJSON replaces an empty/NULL text column with the supplied default
// (e.g. "[]" or "{}") so the API never returns a bare null for JSON columns.
func normalizeJSON(raw, def string) json.RawMessage {
	t := bytes.TrimSpace([]byte(raw))
	if len(t) == 0 || string(t) == "null" {
		return json.RawMessage(def)
	}
	return json.RawMessage(t)
}

// RawToString collapses a JSON scalar into the textual value stored in a TEXT
// column: strings are unquoted, numbers/booleans keep their literal form.
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

// RawToNullableString is RawToString but keeps JSON null as a nil pointer so
// callers can bind SQL NULL.
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

// RawToInt64 decodes a JSON number into an int64.
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

// buildQuotedUpdate is buildUpdate's sibling but back-quotes every column name
// (needed for reserved words such as `order`). Untyped nil values are skipped;
// typed nil pointers are kept so they bind as SQL NULL.
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
