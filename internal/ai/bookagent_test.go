package ai

import (
	"context"
	"encoding/json"
	"fmt"
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

func TestParseDSMLAndTextToolCalls(t *testing.T) {
	content := dsmlInvoke("save_chapter", map[string]any{
		"bookId": "b1", "title": "第一章", "content": "正文", "order": "2",
	})
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
