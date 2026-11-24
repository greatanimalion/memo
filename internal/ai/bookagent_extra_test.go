package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"memo/internal/db"
)

func TestBookAgentSendsNativeTools(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "原生工具测试"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}

	var bodies []sentRequest
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(req.Body)
		bodies = append(bodies, decodeSent(t, raw))
		calls++
		if calls == 1 {
			content := dsmlInvoke("route", map[string]any{"target": "end"})
			return sseResponse(sseDelta(content) + "data: [DONE]\n\n"), nil
		}
		return sseResponse(sseDelta("完成") + "data: [DONE]\n\n"), nil
	})

	em := &recordingEmitter{}
	RunBookAgent(context.Background(), BookAgentRequest{
		Prompt: "写一本书", BookID: book.ID, Model: "deepseek-chat",
		BaseURL: "https://test.local/v1", APIKey: "test-key",
	}, em)

	if len(bodies) == 0 {
		t.Fatal("no request captured")
	}
	first := bodies[0]
	if len(first.Tools) != 1 || first.Tools[0].Function.Name != "route" {
		t.Fatalf("orchestrator tools = %+v, want only route", first.Tools)
	}
}

func TestBookAgentWriterToolSet(t *testing.T) {
	names := map[string]bool{}
	for _, tool := range bookAgentToolsForRole("writer") {
		names[tool.Function.Name] = true
	}
	for _, want := range []string{"route", "get_book_info", "get_chapter", "save_chapter", "update_chapter"} {
		if !names[want] {
			t.Errorf("writer tool set missing %q: %v", want, names)
		}
	}
	if !names["route"] {
		t.Fatal("writer must be able to route")
	}
}

func TestBookAgentGetChapterToolAndPreviousContext(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "章节读取测试"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}
	chapter, err := db.CreateChapter(&db.Chapter{
		ID:        db.NewID(),
		BookID:    book.ID,
		Title:     "第一章",
		Content:   "这是第一章正文，主角走入雨夜。" + strings.Repeat("内容", 100),
		WordCount: 200,
		Order:     1,
		Metadata:  json.RawMessage("{}"),
	})
	if err != nil {
		t.Fatalf("create chapter: %v", err)
	}

	run := &bookAgentRun{bookID: book.ID, completedChapters: 1}
	got, err := run.toolGetChapter(map[string]any{"chapterId": chapter.ID})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "第一章") || !strings.Contains(got, "主角走入雨夜") {
		t.Fatalf("chapter content missing: %q", got)
	}

	latest, err := run.toolGetChapter(map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(latest, "第一章") {
		t.Fatalf("latest chapter fallback failed: %q", latest)
	}

	previous := run.previousChapterContext()
	if !strings.Contains(previous, "上一章《第一章》") || !strings.Contains(previous, "主角走入雨夜") {
		t.Fatalf("previous chapter context = %q", previous)
	}
}

func TestHasValidBookToolCallsAllowsEmptyArguments(t *testing.T) {
	msg := &Message{Role: "assistant", ToolCalls: []ToolCall{{
		ID:       "call_1",
		Type:     "function",
		Function: ToolCallFunction{Name: "get_book_info", Arguments: "{}"},
	}}}
	if !hasValidBookToolCalls(msg) {
		t.Fatal("tool calls with empty arguments must still be executed")
	}
}
