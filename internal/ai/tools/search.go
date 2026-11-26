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

// update_memory 已由 memory.go 中更细分的 write_memory / rename_memory /
// star_memory 取代，原实现保留备查：
//
// // updateMemoryArgs 是 update_memory 的参数；指针字段用于区分
// // “未提供”与“显式设置为空/假”。
// type updateMemoryArgs struct {
// 	ID      string  `json:"id" jsonschema:"description=要修改的记忆 ID"`
// 	Title   *string `json:"title,omitempty" jsonschema:"description=新标题，省略表示不修改"`
// 	Starred *bool   `json:"starred,omitempty" jsonschema:"description=是否星标，省略表示不修改"`
// }

func getMemoryTool() (*Tool, error) {
	return NewTool[searchMemoryArgs]("get_memory", "搜索或列出用户的文件/笔记，可按关键词搜索",
		func(_ context.Context, args searchMemoryArgs) (string, error) {
			return searchMemory(args)
		})
}

// 原 update_memory 工具实现保留备查：
//
// func updateMemoryTool() (*Tool, error) {
// 	return NewTool[updateMemoryArgs]("update_memory", "根据 ID 修改指定记忆的标题或星标状态",
// 		func(_ context.Context, args updateMemoryArgs) (string, error) {
// 			return updateMemory(args)
// 		})
// }
//
// // updateMemory 按 ID 部分更新记忆：只写入调用方显式提供的字段，
// // 并同步刷新 updated 时间。
// func updateMemory(args updateMemoryArgs) (string, error) {
// 	id := strings.TrimSpace(args.ID)
// 	if id == "" {
// 		return "", errors.New("id: required")
// 	}
//
// 	updates := map[string]any{}
// 	if args.Title != nil {
// 		updates["title"] = strings.TrimSpace(*args.Title)
// 	}
// 	if args.Starred != nil {
// 		starred := 0
// 		if *args.Starred {
// 			starred = 1
// 		}
// 		updates["starred"] = starred
// 	}
// 	if len(updates) == 0 {
// 		return "未提供需要修改的字段（title/starred），未做任何修改", nil
// 	}
// 	updates["updated"] = time.Now().UnixMilli()
//
// 	ok, err := db.UpdateMemory(id, updates)
// 	if err != nil {
// 		return "", err
// 	}
// 	if !ok {
// 		return fmt.Sprintf("未找到 id 为 %s 的记忆，未做任何修改", id), nil
// 	}
// 	return fmt.Sprintf("已更新记忆 %s", id), nil
// }

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
