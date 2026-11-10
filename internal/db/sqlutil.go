package db

import (
	"fmt"
	"regexp"
	"strings"
)

var identifierRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// buildUpdate 将部分更新映射转换为 `col = ?` 片段。无法用作 SQL 标识符的
// 键会被跳过（防御性处理：键始终来自自身代码，绝不来自用户输入）。
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

// insertColumns 为给定的列列表构建 INSERT 语句。
func insertColumns(columns []string) string {
	placeholders := make([]string, len(columns))
	for i := range columns {
		placeholders[i] = "?"
	}
	return fmt.Sprintf("INSERT INTO %%s (%s) VALUES (%s)",
		strings.Join(columns, ", "), strings.Join(placeholders, ", "))
}
