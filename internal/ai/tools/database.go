package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"memo/internal/db"
)

// diaryWriteMu 串行化 AI 对日记的读-改-写，避免同轮多个 write_diary 调用
// 或并发请求互相覆盖同一个月份的数据。
var diaryWriteMu sync.Mutex

type diaryTodoArg struct {
	Text string `json:"text" jsonschema:"description=待办事项内容"`
}

type writeDiaryArgs struct {
	Date  string         `json:"date" jsonschema:"description=日记日期，格式：YYYY-MM-DD"`
	Todos []diaryTodoArg `json:"todos" jsonschema:"description=待办事项列表"`
	Note  string         `json:"note,omitempty" jsonschema:"description=日记备注或总结"`
}

type diaryTodoItem struct {
	ID        float64 `json:"id"`
	Text      string  `json:"text"`
	Completed bool    `json:"completed"`
}

type diaryDay struct {
	Todos []diaryTodoItem `json:"todos"`
	Note  string          `json:"note"`
}

func writeDiaryTool() (*Tool, error) {
	return NewTool[writeDiaryArgs]("write_diary", "记录日记，传入日期、待办事项列表和备注",
		func(_ context.Context, args writeDiaryArgs) (string, error) {
			return writeDiary(args)
		})
}

// writeDiary 将一天的数据合并写入该日期所属月份的日记行。
// 日记表以 YYYY-MM 为 id、按月保存 monthDiarys，因此必须先读取该月已有
// 数据再合并当天，否则会覆盖整月或写到一个前端读不到的 id 上。
func writeDiary(args writeDiaryArgs) (string, error) {
	if args.Date == "" {
		return "", errors.New("date: required")
	}
	if args.Todos == nil {
		return "", errors.New("todos: required")
	}

	date, err := time.Parse("2006-01-02", args.Date)
	if err != nil {
		return "", fmt.Errorf("date: invalid format, want YYYY-MM-DD: %w", err)
	}
	dateKey := date.Format("2006-01-02")
	monthKey := date.Format("2006-01")

	items := make([]diaryTodoItem, 0, len(args.Todos))
	for _, t := range args.Todos {
		items = append(items, diaryTodoItem{
			ID:   float64(time.Now().UnixMilli()) + rand.Float64(),
			Text: t.Text,
		})
	}
	day, err := json.Marshal(diaryDay{Todos: items, Note: args.Note})
	if err != nil {
		return "", err
	}

	diaryWriteMu.Lock()
	defer diaryWriteMu.Unlock()

	monthDiarys := map[string]json.RawMessage{}
	existing, err := db.GetDiary(monthKey)
	if err != nil {
		return "", err
	}
	if existing != nil {
		for k, v := range existing.MonthDiarys {
			monthDiarys[k] = v
		}
	}
	monthDiarys[dateKey] = day

	if _, err := db.UpdateDiary(monthKey, monthDiarys); err != nil {
		return "", err
	}
	return "日记记录成功，日期：" + dateKey, nil
}
