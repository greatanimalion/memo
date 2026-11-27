package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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

func TestReadChaptersValidation(t *testing.T) {
	// 超过 5 章直接报错，且不会触达数据库
	if _, err := runTool("read_chapters", `{"chapterIds":["1","2","3","4","5","6"]}`); err == nil {
		t.Fatal("more than 5 chapters should fail")
	}
	if _, err := runTool("read_chapters", `{}`); err == nil {
		t.Fatal("missing chapterIds/orders should fail")
	}
	if _, err := runTool("read_chapters", `{"chapterIds":["1"],"orders":[1]}`); err == nil {
		t.Fatal("chapterIds and orders should not be provided together")
	}
	if _, err := runTool("read_chapters", `{"orders":[1]}`); err == nil {
		t.Fatal("orders without bookId should fail")
	}
}

func TestReadChaptersPreviewAndFullResult(t *testing.T) {
	tool, ok := chatTools.Get("read_chapters")
	if !ok {
		t.Fatal("read_chapters not registered")
	}
	// 模型拿到完整结果
	if !tool.KeepFullResult() {
		t.Fatal("read_chapters should keep full result for the model")
	}
	// 前端预览：保留章节名称/字数/内容开头，隐藏内部 id
	result := "共读取 2 个章节：" +
		"\n\n# 第一章 开端（id: c1，第 1 章）\n\n正文一" +
		"\n\n# 第二章 转折（id: c2，第 2 章）\n\n正文二"
	preview := tool.Preview(result)
	if strings.Contains(preview, "id:") || strings.Contains(preview, "c1") || strings.Contains(preview, "c2") {
		t.Fatalf("preview still contains internal id: %q", preview)
	}
	for _, want := range []string{
		"共读取 2 个章节",
		"章节名称：第一章 开端",
		"字数：3",
		"内容：正文一",
		"章节名称：第二章 转折",
	} {
		if !strings.Contains(preview, want) {
			t.Fatalf("preview %q missing %q", preview, want)
		}
	}
}

func TestChapterPreviewsHideIDs(t *testing.T) {
	// 单章读取
	read, ok := chatTools.Get("read_chapter")
	if !ok {
		t.Fatal("read_chapter not registered")
	}
	got := read.Preview("# 第一章（id: c1）\n\n正文内容")
	want := "章节名称：第一章\n字数：4\n内容：正文内容"
	if got != want {
		t.Fatalf("read_chapter preview = %q, want %q", got, want)
	}

	// 章节列表
	list, ok := chatTools.Get("list_chapters")
	if !ok {
		t.Fatal("list_chapters not registered")
	}
	got = list.Preview("《书》共 1 章：\n- [1] 开端（id: c1，1200 字）")
	want = "《书》共 1 章：\n- [1] 开端（1200 字）"
	if got != want {
		t.Fatalf("list_chapters preview = %q, want %q", got, want)
	}

	// 新建/更新
	create, ok := chatTools.Get("create_chapter")
	if !ok {
		t.Fatal("create_chapter not registered")
	}
	if got = create.Preview("章节创建成功: 开端 (id: c1)"); got != "章节创建成功: 开端" {
		t.Fatalf("create_chapter preview = %q", got)
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
