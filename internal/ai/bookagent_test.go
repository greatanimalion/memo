package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"memo/internal/db"
)

func sseDelta(content string) string {
	payload := map[string]any{
		"choices": []any{map[string]any{
			"delta": map[string]any{"content": content},
		}},
	}
	raw, _ := json.Marshal(payload)
	return "data: " + string(raw) + "\n\n"
}

func dsmlInvoke(name string, params map[string]any) string {
	var sb strings.Builder
	sb.WriteString("<")
	sb.WriteString(bookAgentDSMLTag)
	sb.WriteString("tool_calls>\n")
	sb.WriteString("<")
	sb.WriteString(bookAgentDSMLTag)
	sb.WriteString(`invoke name="`)
	sb.WriteString(name)
	sb.WriteString(`">`)
	for k, v := range params {
		sb.WriteString("<")
		sb.WriteString(bookAgentDSMLTag)
		sb.WriteString(`parameter name="`)
		sb.WriteString(k)
		sb.WriteString(`">`)
		sb.WriteString(fmt.Sprint(v))
		sb.WriteString("</")
		sb.WriteString(bookAgentDSMLTag)
		sb.WriteString("parameter>")
	}
	sb.WriteString("</")
	sb.WriteString(bookAgentDSMLTag)
	sb.WriteString("invoke>\n")
	sb.WriteString("</")
	sb.WriteString(bookAgentDSMLTag)
	sb.WriteString("tool_calls>")
	return sb.String()
}

func TestRunBookAgentStreamsAndFinishes(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "Test Book"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}

	calls := 0
	stubTransport(t, func(*http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			content := dsmlInvoke("route", map[string]any{"target": "end"})
			return sseResponse(sseDelta(content) + "data: [DONE]\n\n"), nil
		}
		return sseResponse(sseDelta("好的，任务完成。") + "data: [DONE]\n\n"), nil
	})

	em := &recordingEmitter{}
	RunBookAgent(context.Background(), BookAgentRequest{
		Prompt:    "写一本书",
		BookID:    book.ID,
		Model:     "deepseek-chat",
		BaseURL:   "https://test.local/v1",
		APIKey:    "test-key",
		RequestID: "req-book-agent",
	}, em)

	out := em.String()
	for _, want := range []string{
		"event: agent\ndata: {\"name\":\"orchestrator\"}",
		"event: tool_call\ndata: {\"agent\":\"orchestrator\",\"name\":\"route\"}",
		"流程已结束",
		"event: done\ndata: [DONE]",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("stream missing %q:\n%s", want, out)
		}
	}

	records, err := db.GetBookAgentsByBookID(book.ID)
	if err != nil {
		t.Fatalf("list book agents: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 book agent record, got %d", len(records))
	}
	if records[0].Status != "done" {
		t.Fatalf("status = %q", records[0].Status)
	}
	if !strings.Contains(string(records[0].Messages), "orchestrator") {
		t.Fatalf("messages not persisted: %s", records[0].Messages)
	}
}

func TestBookAgentToolReplayPrecedesToolResult(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "Tool Replay Book"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}

	var secondBody string
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			content := dsmlInvoke("route", map[string]any{"target": "end"})
			return sseResponse(sseDelta(content) + "data: [DONE]\n\n"), nil
		}
		raw, _ := io.ReadAll(req.Body)
		secondBody = string(raw)
		return sseResponse(sseDelta("好的，任务完成。") + "data: [DONE]\n\n"), nil
	})

	em := &recordingEmitter{}
	RunBookAgent(context.Background(), BookAgentRequest{
		Prompt:  "写一本书",
		BookID:  book.ID,
		Model:   "deepseek-chat",
		BaseURL: "https://test.local/v1",
		APIKey:  "test-key",
	}, em)

	// 第二轮请求必须先把带 tool_calls 的 assistant 消息放进去，再紧跟 tool 结果，
	// 否则 OpenAI 兼容接口会报 “tool must be a response to a preceding tool_calls”。
	assistantIdx := strings.Index(secondBody, `"tool_calls"`)
	toolIdx := strings.Index(secondBody, `"role":"tool"`)
	if assistantIdx < 0 {
		t.Fatalf("second request missing assistant tool_calls:\n%s", secondBody)
	}
	if toolIdx < 0 {
		t.Fatalf("second request missing tool result:\n%s", secondBody)
	}
	if assistantIdx > toolIdx {
		t.Fatalf("tool_calls must precede tool result:\n%s", secondBody)
	}
}

func TestParseDSMLAndTextToolCalls(t *testing.T) {
	content := dsmlInvoke("save_chapter", map[string]any{"bookId": "b1", "title": "第一章", "content": "正文", "order": "2"})
	calls := parseDSMLToolCalls(content)
	if len(calls) != 1 || calls[0].Name != "save_chapter" {
		t.Fatalf("dsml parse = %+v", calls)
	}
	order, ok := calls[0].Args["order"].(int)
	if !ok || order != 2 {
		t.Fatalf("order arg not converted to int: %#v", calls[0].Args["order"])
	}

	textCalls := parseTextToolCalls(`route({ "target": "writer" })`)
	if len(textCalls) != 1 || textCalls[0].Name != "route" || textCalls[0].Args["target"] != "writer" {
		t.Fatalf("text parse = %+v", textCalls)
	}
}

func TestBookAgentToolWhitelist(t *testing.T) {
	if !bookAgentToolAllowed("orchestrator", "route") {
		t.Fatal("orchestrator should be allowed route")
	}
	if bookAgentToolAllowed("orchestrator", "save_chapter") {
		t.Fatal("orchestrator must not be allowed save_chapter")
	}
	if bookAgentToolAllowed("thinker", "save_chapter") {
		t.Fatal("thinker must not be allowed save_chapter")
	}
	if !bookAgentToolAllowed("writer", "save_chapter") {
		t.Fatal("writer should be allowed save_chapter")
	}
	if bookAgentToolAllowed("consistency", "update_chapter") {
		t.Fatal("consistency must not be allowed update_chapter")
	}
	if bookAgentToolAllowed("unknown", "route") {
		t.Fatal("unknown role must not be allowed anything")
	}
}

func TestConsistencyVerdict(t *testing.T) {
	run := &bookAgentRun{}
	cases := map[string]string{
		"检查完毕。\n结论: 通过":   "通过",
		"发现问题。\n结论：不通过":   "不通过",
		"尚未读取数据。\n结论: 待检": "待检",
		"未通过项（如有）: 无":     "",
	}
	for content, want := range cases {
		if got := run.consistencyVerdict(content); got != want {
			t.Fatalf("verdict(%q) = %q, want %q", content, got, want)
		}
	}
}

func TestParseOutlineChapters(t *testing.T) {
	outline := "# 书名\n\n## 章节目录\n\n" +
		"### 第一章: 开端\n- 概要: 主角登场\n- 预计字数: 1000\n\n" +
		"### 第二章：冲突\n- 概要: 矛盾升级\n"
	chapters := parseOutlineChapters(outline)
	if len(chapters) != 2 {
		t.Fatalf("expected 2 chapters, got %d (%+v)", len(chapters), chapters)
	}
	if chapters[0].Title != "开端" || chapters[0].Summary != "主角登场" {
		t.Fatalf("chapter 0 = %+v", chapters[0])
	}
	if chapters[1].Title != "冲突" || chapters[1].Summary != "矛盾升级" {
		t.Fatalf("chapter 1 = %+v", chapters[1])
	}
}

func TestBookAgentCreatesMultipleChapters(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "多章节测试"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}

	run := &bookAgentRun{bookID: book.ID}
	run.board = &db.BookAgentState{
		BookID:   book.ID,
		Progress: json.RawMessage("[]"),
		Issues:   json.RawMessage("[]"),
	}
	run.loadOutline("### 第一章: 开端\n- 概要: 开始\n### 第二章: 结局\n- 概要: 结束")
	if len(run.outlineChapters) != 2 {
		t.Fatalf("outline parse = %+v", run.outlineChapters)
	}

	// 第一章
	run.autoSaveWriter(strings.Repeat("这是第一章的正文内容，用于测试。", 12))
	if run.chapterID == "" {
		t.Fatal("chapter 1 not created")
	}
	firstID := run.chapterID
	run.markChapterComplete()
	if run.chapterID != "" {
		t.Fatalf("chapterID should reset after completion, got %q", run.chapterID)
	}

	// 第二章
	run.autoSaveWriter(strings.Repeat("这是第二章的正文内容，用于测试。", 12))
	if run.chapterID == "" || run.chapterID == firstID {
		t.Fatalf("chapter 2 not created as a new row (id=%q first=%q)", run.chapterID, firstID)
	}
	run.markChapterComplete()

	metas, err := db.GetChapterMetaByBookID(book.ID)
	if err != nil {
		t.Fatalf("list chapters: %v", err)
	}
	if len(metas) != 2 {
		t.Fatalf("expected 2 chapters persisted, got %d", len(metas))
	}
}
