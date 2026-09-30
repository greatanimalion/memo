package db

import (
	"fmt"
	"regexp"
	"strings"
)

var identifierRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// buildUpdate turns a partial update map into `col = ?` fragments. Values that
// cannot be used as SQL identifiers are skipped (defensive: the keys always
// come from our own code, never from user input).
func buildUpdate(updates map[string]any, skip ...string) ([]string, []any) {
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
		fields = append(fields, key+" = ?")
		args = append(args, value)
	}
	return fields, args
}

func joinFields(fields []string) string {
	return strings.Join(fields, ", ")
}

// insertColumns builds an INSERT statement for the given column list.
func insertColumns(columns []string) string {
	placeholders := make([]string, len(columns))
	for i := range columns {
		placeholders[i] = "?"
	}
	return fmt.Sprintf("INSERT INTO %%s (%s) VALUES (%s)",
		strings.Join(columns, ", "), strings.Join(placeholders, ", "))
}
