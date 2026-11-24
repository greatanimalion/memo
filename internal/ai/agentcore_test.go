package ai

import (
	"strings"
	"testing"
)

func TestTrimMessagesKeepsSystemAndRecent(t *testing.T) {
	messages := []Message{{Role: "system", Content: "sys"}}
	for i := 0; i < 100; i++ {
		messages = append(messages, Message{Role: "user", Content: strings.Repeat("x", 400)})
	}
	messages = append(messages, Message{Role: "user", Content: "最新问题"})

	trimmed := trimMessages(messages, 200)
	if len(trimmed) >= len(messages) {
		t.Fatalf("expected trimming, got %d messages", len(trimmed))
	}
	if trimmed[0].Role != "system" || trimmed[0].Content != "sys" {
		t.Fatalf("system message not preserved: %+v", trimmed[0])
	}
	if last := trimmed[len(trimmed)-1]; last.Content != "最新问题" {
		t.Fatalf("latest message dropped: %+v", last)
	}
	if trimmed[1].Role == "tool" {
		t.Fatal("trimmed history must not start with a tool message")
	}
}

func TestTrimMessagesNoopWhenWithinBudget(t *testing.T) {
	messages := []Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hi"},
	}
	got := trimMessages(messages, 1000)
	if len(got) != len(messages) {
		t.Fatalf("got %d messages, want %d", len(got), len(messages))
	}
}

func TestClipTextKeepsStartAndEnd(t *testing.T) {
	text := strings.Repeat("a", 100) + strings.Repeat("b", 100)
	clipped := clipText(text, 20)
	if !strings.HasPrefix(clipped, "aaaaaaaaaa") {
		t.Fatalf("missing start: %q", clipped)
	}
	if !strings.HasSuffix(clipped, "bbbbbbbbbb") {
		t.Fatalf("missing end: %q", clipped)
	}
	if !strings.Contains(clipped, "字符已截断") {
		t.Fatalf("missing truncation marker: %q", clipped)
	}
}

func TestExecuteToolSafelyRecoversPanic(t *testing.T) {
	if _, err := executeToolSafely("no_such_tool", "{}"); err == nil {
		t.Fatal("unknown tool should return an error, not panic")
	}
}
