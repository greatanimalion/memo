package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"

	"memo/internal/db"
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "memo-tools-test-")
	if err != nil {
		panic(err)
	}
	if err := os.Setenv("MEMORY_DATA_DIR", filepath.ToSlash(dir)); err != nil {
		panic(err)
	}
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

// runTool 通过聊天工具注册表执行一次工具调用。
func runTool(name, rawArgs string) (string, error) {
	return chatTools.ExecuteRaw(context.Background(), name, rawArgs)
}

func TestGetTimeToolFormat(t *testing.T) {
	got, err := runTool("get_time", "{}")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^\d{4}/\d{1,2}/\d{1,2} \d{2}:\d{2}:\d{2}$`).MatchString(got) {
		t.Fatalf("get_time = %q", got)
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := time.ParseInLocation("2006/1/2 15:04:05", got, loc)
	if err != nil {
		t.Fatalf("parse %q: %v", got, err)
	}
	if diff := time.Since(parsed); diff < -2*time.Minute || diff > 2*time.Minute {
		t.Errorf("get_time %q is not close to now in Asia/Shanghai (%v)", got, diff)
	}
}

func TestUnknownTool(t *testing.T) {
	if _, err := runTool("nope", "{}"); err == nil || err.Error() != `Tool "nope" not found.` {
		t.Fatalf("err = %v", err)
	}
}

func TestWriteDiaryTool(t *testing.T) {
	got, err := runTool("write_diary", `{"date":"2026-01-05","todos":[{"text":"买菜"},{"text":"跑步"}],"note":""}`)
	if err != nil {
		t.Fatal(err)
	}
	if got != "日记记录成功，日期：2026-01-05" {
		t.Fatalf("result = %q", got)
	}
	if _, err := runTool("write_diary", `{}`); err == nil {
		t.Fatal("missing date should fail validation")
	}
	if _, err := runTool("write_diary", `not json`); err == nil {
		t.Fatal("invalid arguments should fail")
	}
}

func TestGetMemoryTool(t *testing.T) {
	if _, err := db.DB().Exec("DELETE FROM memorys"); err != nil {
		t.Fatal(err)
	}

	got, err := runTool("get_memory", `{}`)
	if err != nil {
		t.Fatal(err)
	}
	if got != "暂无记忆" {
		t.Fatalf("empty list = %q", got)
	}

	older, newer := int64(100), int64(200)
	memories := []db.Memory{
		{ID: "m-folder", Title: "文件夹", IsFolder: 1, Created: 1, Updated: 1, Starred: 0},
		{ID: "m-old", Title: "旧的会议记录", Created: 1, Updated: 1, VisitedTime: &older, Starred: 0},
		{ID: "m-new", Title: "NEW Report", Created: 1, Updated: 1, VisitedTime: &newer, Starred: 0},
	}
	for i := range memories {
		if err := db.CreateMemory(&memories[i]); err != nil {
			t.Fatal(err)
		}
	}

	recent, err := runTool("get_memory", `{}`)
	if err != nil {
		t.Fatal(err)
	}
	wantRecent := "[NEW Report] (id: m-new)\n[旧的会议记录] (id: m-old)"
	if recent != wantRecent {
		t.Fatalf("recent = %q, want %q", recent, wantRecent)
	}

	byKeyword, err := runTool("get_memory", `{"keyword":"会议"}`)
	if err != nil {
		t.Fatal(err)
	}
	if byKeyword != "[旧的会议记录] (id: m-old)" {
		t.Fatalf("keyword match = %q", byKeyword)
	}

	caseInsensitive, err := runTool("get_memory", `{"keyword":"REPort"}`)
	if err != nil {
		t.Fatal(err)
	}
	if caseInsensitive != "[NEW Report] (id: m-new)" {
		t.Fatalf("case insensitive match = %q", caseInsensitive)
	}

	none, err := runTool("get_memory", `{"keyword":"不存在的关键词"}`)
	if err != nil {
		t.Fatal(err)
	}
	if none != "未找到匹配的记忆" {
		t.Fatalf("no match = %q", none)
	}
}

func TestWriteDiaryMergesIntoMonthRow(t *testing.T) {
	if _, err := db.DB().Exec("DELETE FROM diarys"); err != nil {
		t.Fatal(err)
	}

	existing := map[string]json.RawMessage{
		"2031-04-01": json.RawMessage(`{"todos":[],"note":"已有内容"}`),
	}
	if _, err := db.UpdateDiary("2031-04", existing); err != nil {
		t.Fatal(err)
	}

	result, err := runTool("write_diary", `{"date":"2031-04-15","todos":[{"text":"写测试"}],"note":"新备注"}`)
	if err != nil {
		t.Fatal(err)
	}
	if result != "日记记录成功，日期：2031-04-15" {
		t.Fatalf("result = %q", result)
	}

	diary, err := db.GetDiary("2031-04")
	if err != nil || diary == nil {
		t.Fatalf("month diary read failed: %v", err)
	}
	if _, ok := diary.MonthDiarys["2031-04-01"]; !ok {
		t.Fatal("existing day was overwritten")
	}
	if _, ok := diary.MonthDiarys["2031-04-15"]; !ok {
		t.Fatal("new day was not written to the month row")
	}

	// 不应再写到以完整日期为 id 的错误行上。
	legacy, err := db.GetDiary("2031-04-15")
	if err != nil {
		t.Fatal(err)
	}
	if legacy != nil {
		t.Fatal("diary was written to a date id instead of the month id")
	}
}
