package tools

import (
	"context"
	// "errors" // update_memory 迁出后不再使用
	"fmt"
	"slices"
	"strings"

	// "time" // update_memory 迁出后不再使用

	"memo/internal/db"
)

type searchMemoryArgs struct {
	Keyword string `json:"keyword,omitempty" jsonschema:"description=搜索关键词，为空则列出最近的记忆"`
}

func getMemoryTool() (*Tool, error) {
	return NewTool[searchMemoryArgs]("get_memory", "搜索或列出用户的文件/笔记，可按关键词搜索",
		func(_ context.Context, args searchMemoryArgs) (string, error) {
			return searchMemory(args)
		})
}

// searchMemory 列出或搜索非文件夹记忆（get_memory 工具）。
// 原实现从原始 JSON 解析参数，现由 tools.NewTool 统一解析。
func searchMemory(args searchMemoryArgs) (string, error) {
	all, err := db.ListMemories()
	if err != nil {
		return "", err
	}
	plain := make([]db.Memory, 0, len(all))
	for _, m := range all {
		if !m.IsFolder.Bool() {
			plain = append(plain, m)
		}
	}

	if args.Keyword != "" {
		keyword := strings.ToLower(args.Keyword)
		matches := make([]db.Memory, 0, len(plain))
		for _, m := range plain {
			if strings.Contains(strings.ToLower(m.Title), keyword) {
				matches = append(matches, m)
			}
		}
		if len(matches) == 0 {
			return "未找到匹配的记忆", nil
		}
		if len(matches) > 10 {
			matches = matches[:10]
		}
		return formatMemories(matches), nil
	}

	slices.SortStableFunc(plain, func(a, b db.Memory) int {
		av, bv := int64(0), int64(0)
		if a.VisitedTime != nil {
			av = *a.VisitedTime
		}
		if b.VisitedTime != nil {
			bv = *b.VisitedTime
		}
		switch {
		case av > bv:
			return -1
		case av < bv:
			return 1
		}
		return 0
	})
	if len(plain) == 0 {
		return "暂无记忆", nil
	}
	if len(plain) > 10 {
		plain = plain[:10]
	}
	return formatMemories(plain), nil
}

func formatMemories(items []db.Memory) string {
	lines := make([]string, 0, len(items))
	for _, m := range items {
		lines = append(lines, fmt.Sprintf("[%s] (id: %s)", m.Title, m.ID))
	}
	return strings.Join(lines, "\n")
}
