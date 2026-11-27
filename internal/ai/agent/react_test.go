package agent

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"memo/internal/ai/llm"
	"memo/internal/ai/memory"
	"memo/internal/db"
)

// ──────────────────── 取消 ────────────────────

func TestRunChatStreamCancelledEmitsCancelThenDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	rec := &recordingEmitter{}
	RunChatStream(ctx, ChatRequest{
		Prompt:    "你好",
		Model:     "qwen-plus",
		APIKey:    "key",
		RequestID: "cancel-stream-1",
	}, rec)

	want := "event: cancel\ndata: 请求已取消\n\nevent: done\ndata: [DONE]\n\n"
	if rec.String() != want {
		t.Fatalf("stream cancel branch mismatch:\ngot  %q\nwant %q", rec.String(), want)
	}
	if memory.AbortRequest("cancel-stream-1") {
		t.Fatal("requestId was not unregistered after the run")
	}
}

func TestRunAgentCancelledEmitsCancelThenDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	rec := &recordingEmitter{}
	RunAgent(ctx, ChatRequest{
		Prompt:    "你好",
		Model:     "qwen-plus",
		APIKey:    "key",
		RequestID: "cancel-agent-1",
	}, rec)

	want := "event: cancel\ndata: 请求已取消\n\nevent: done\ndata: [DONE]\n\n"
	if rec.String() != want {
		t.Fatalf("agent cancel branch mismatch:\ngot  %q\nwant %q", rec.String(), want)
	}
	if memory.AbortRequest("cancel-agent-1") {
		t.Fatal("requestId was not unregistered after the run")
	}
}

// ──────────────────── 消息组装 ────────────────────

func TestBuildMessages(t *testing.T) {
	req := ChatRequest{
		Prompt: "新问题",
		History: []HistoryMessage{
			{Role: "user", Content: "旧问题"},
			{Role: "system", Content: "旧回答"},
			{Role: "assistant", Content: "另一条回答"},
		},
	}
	msgs := buildMessages(req, ChatSystemPrompt)
	want := []llm.Message{
		{Role: "system", Content: "你是一个中文 AI 助手。请简洁、准确地回答用户的问题。"},
		{Role: "user", Content: "旧问题"},
		{Role: "assistant", Content: "旧回答"},
		{Role: "assistant", Content: "另一条回答"},
		{Role: "user", Content: "新问题"},
	}
	if len(msgs) != len(want) {
		t.Fatalf("got %d messages, want %d", len(msgs), len(want))
	}
	for i := range want {
		if msgs[i].Role != want[i].Role || msgs[i].Content != want[i].Content {
			t.Errorf("message %d = %+v, want %+v", i, msgs[i], want[i])
		}
	}

	withSystem := buildMessages(ChatRequest{Prompt: "p", SystemPrompt: "自定义提示词"}, ChatSystemPrompt)
	if withSystem[0].Role != "system" || withSystem[0].Content != "自定义提示词" {
		t.Errorf("custom system prompt ignored: %+v", withSystem[0])
	}
}

// ──────────────────── 流式对话 ────────────────────

func TestRunChatStreamEventFlow(t *testing.T) {
	var modelReq []byte
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		modelReq, _ = io.ReadAll(req.Body)
		return sseResponse(
			"data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n" +
				"data: {\"choices\":[{\"delta\":{\"content\":\"，世界\"}}]}\n\n" +
				"data: [DONE]\n\n"), nil
	})

	rec := &recordingEmitter{}
	RunChatStream(context.Background(), ChatRequest{
		Prompt: "介绍一下",
		History: []HistoryMessage{
			{Role: "user", Content: "之前的问题"},
			{Role: "system", Content: "之前的回答"},
		},
		Model:   "deepseek-chat",
		BaseURL: "https://test.local/v1",
		APIKey:  "key",
	}, rec)

	want := "event: message\ndata: 你好\n\n" +
		"event: message\ndata: ，世界\n\n" +
		"event: done\ndata: [DONE]\n\n"
	if rec.String() != want {
		t.Fatalf("event flow mismatch:\ngot  %q\nwant %q", rec.String(), want)
	}

	sent := decodeSent(t, modelReq)
	if sent.Model != "deepseek-chat" {
		t.Errorf("model = %q, want deepseek-chat", sent.Model)
	}
	if !sent.Stream || sent.Temperature != 0.7 {
		t.Errorf("stream=%v temperature=%v, want true/0.7", sent.Stream, sent.Temperature)
	}
	if len(sent.Tools) != 0 {
		t.Errorf("chat-stream must not send tools, got %d", len(sent.Tools))
	}
	wantMsgs := []llm.Message{
		{Role: "system", Content: ChatSystemPrompt},
		{Role: "user", Content: "之前的问题"},
		{Role: "assistant", Content: "之前的回答"},
		{Role: "user", Content: "介绍一下"},
	}
	if len(sent.Messages) != len(wantMsgs) {
		t.Fatalf("sent %d messages, want %d (%+v)", len(sent.Messages), len(wantMsgs), sent.Messages)
	}
	for i := range wantMsgs {
		if sent.Messages[i].Role != wantMsgs[i].Role || sent.Messages[i].Content != wantMsgs[i].Content {
			t.Errorf("sent message %d = %+v, want %+v", i, sent.Messages[i], wantMsgs[i])
		}
	}
}

func TestRunChatStreamCustomSystemPrompt(t *testing.T) {
	var modelReq []byte
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		modelReq, _ = io.ReadAll(req.Body)
		return sseResponse("data: [DONE]\n\n"), nil
	})

	rec := &recordingEmitter{}
	RunChatStream(context.Background(), ChatRequest{
		Prompt:       "p",
		SystemPrompt: "自定义系统提示词",
		Model:        "qwen-plus",
		BaseURL:      "https://test.local/v1",
		APIKey:       "key",
	}, rec)

	sent := decodeSent(t, modelReq)
	if len(sent.Messages) == 0 || sent.Messages[0].Content != "自定义系统提示词" {
		t.Fatalf("system message = %+v", sent.Messages)
	}
	if rec.String() != "event: done\ndata: [DONE]\n\n" {
		t.Fatalf("events = %q", rec.String())
	}
}

func TestRunChatStreamErrorEvent(t *testing.T) {
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusBadRequest,
			Header:     http.Header{},
			Body:       io.NopCloser(strings.NewReader(`{"error":{"message":"Invalid API key"}}`)),
		}, nil
	})

	rec := &recordingEmitter{}
	RunChatStream(context.Background(), ChatRequest{
		Prompt: "p", Model: "qwen-plus", BaseURL: "https://test.local/v1", APIKey: "bad",
	}, rec)

	want := "event: error\ndata: llm http 400: {\"error\":{\"message\":\"Invalid API key\"}}\n\n" +
		"event: done\ndata: [DONE]\n\n"
	if rec.String() != want {
		t.Fatalf("error branch mismatch:\ngot  %q\nwant %q", rec.String(), want)
	}
}

// ──────────────────── Agent 循环 ────────────────────

func TestRunAgentToolLoop(t *testing.T) {
	var bodies [][]byte
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(req.Body)
		bodies = append(bodies, raw)
		calls++
		if calls == 1 {
			return sseResponse(toolCallResponse("call_1", "get_time", "{}")), nil
		}
		return sseResponse(completionResponse("现在是")), nil
	})

	rec := &recordingEmitter{}
	RunAgent(context.Background(), ChatRequest{
		Prompt: "几点了", Model: "qwen-plus", BaseURL: "https://test.local/v1", APIKey: "key",
	}, rec)

	if calls != 2 {
		t.Fatalf("model called %d times, want 2", calls)
	}
	if len(rec.events) != 4 {
		t.Fatalf("got %d events: %q", len(rec.events), rec.events)
	}
	if rec.events[0] != "event: tool_call\ndata: {\"name\":\"get_time\"}\n\n" {
		t.Errorf("event 0 = %q", rec.events[0])
	}
	if !regexp.MustCompile(`^event: tool\ndata: \{"name":"get_time","result":"\d{4}/\d{1,2}/\d{1,2} \d{2}:\d{2}:\d{2}"\}\n\n$`).MatchString(rec.events[1]) {
		t.Errorf("event 1 = %q", rec.events[1])
	}
	if rec.events[2] != "event: message\ndata: 现在是\n\n" {
		t.Errorf("event 2 = %q", rec.events[2])
	}
	if rec.events[3] != "event: done\ndata: [DONE]\n\n" {
		t.Errorf("event 3 = %q", rec.events[3])
	}

	first := decodeSent(t, bodies[0])
	if len(first.Tools) != 12 {
		t.Fatalf("first round sent %d tools, want 12", len(first.Tools))
	}
	wantTools := []string{
		"get_time", "write_diary", "get_memory",
		"write_memory", "read_memory", "rename_memory", "star_memory",
		"list_chapters", "read_chapter", "read_chapters", "create_chapter", "update_chapter",
	}
	for i, name := range wantTools {
		if first.Tools[i].Function.Name != name {
			t.Errorf("tool %d = %q, want %q", i, first.Tools[i].Function.Name, name)
		}
		if first.Tools[i].Function.Parameters == nil {
			t.Errorf("tool %q has no parameters schema", name)
		}
	}
	if len(first.Messages) != 2 || first.Messages[0].Content != DefaultSystemPrompt {
		t.Fatalf("first round messages = %+v", first.Messages)
	}

	second := decodeSent(t, bodies[1])
	if len(second.Messages) != 4 {
		t.Fatalf("second round sent %d messages, want 4", len(second.Messages))
	}
	assistant := second.Messages[2]
	if assistant.Role != "assistant" || len(assistant.ToolCalls) != 1 || assistant.ToolCalls[0].ID != "call_1" {
		t.Errorf("assistant message = %+v", assistant)
	}
	toolMsg := second.Messages[3]
	if toolMsg.Role != "tool" || toolMsg.ToolCallID != "call_1" || toolMsg.Name != "get_time" {
		t.Errorf("tool message = %+v", toolMsg)
	}
	if toolMsg.Content == "" {
		t.Errorf("tool result content is empty")
	}
	if !regexp.MustCompile(`^\d{4}/\d{1,2}/\d{1,2} \d{2}:\d{2}:\d{2}$`).MatchString(toolMsg.Content) {
		t.Errorf("tool result = %q", toolMsg.Content)
	}
}

func TestRunAgentWritesDiary(t *testing.T) {
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			return sseResponse(toolCallResponse("call_d1", "write_diary",
				`{"date":"2026-09-30","todos":[{"text":"写测试"}],"note":"完成"}`)), nil
		}
		return sseResponse(completionResponse("已记录")), nil
	})

	rec := &recordingEmitter{}
	RunAgent(context.Background(), ChatRequest{
		Prompt: "记一下", Model: "qwen-plus", BaseURL: "https://test.local/v1", APIKey: "key",
	}, rec)

	if calls != 2 {
		t.Fatalf("model called %d times, want 2", calls)
	}
	wantTool := "event: tool\ndata: {\"name\":\"write_diary\",\"result\":\"日记记录成功，日期：2026-09-30\"}\n\n"
	if rec.events[1] != wantTool {
		t.Fatalf("tool event = %q, want %q", rec.events[1], wantTool)
	}
	if rec.events[2] != "event: message\ndata: 已记录\n\n" {
		t.Errorf("message event = %q", rec.events[2])
	}

	diary, err := db.GetDiary("2026-09")
	if err != nil || diary == nil {
		t.Fatalf("diary read failed: %v", err)
	}
	raw, ok := diary.MonthDiarys["2026-09-30"]
	if !ok {
		t.Fatalf("monthDiarys = %v", diary.MonthDiarys)
	}
	var day struct {
		Todos []struct {
			ID        float64 `json:"id"`
			Text      string  `json:"text"`
			Completed bool    `json:"completed"`
		} `json:"todos"`
		Note string `json:"note"`
	}
	if err := json.Unmarshal(raw, &day); err != nil {
		t.Fatalf("decode day: %v", err)
	}
	if len(day.Todos) != 1 || day.Todos[0].Text != "写测试" || day.Todos[0].Completed {
		t.Fatalf("todos = %+v", day.Todos)
	}
	if day.Todos[0].ID < 1e12 {
		t.Errorf("todo id should be a millisecond timestamp float, got %v", day.Todos[0].ID)
	}
	if day.Note != "完成" {
		t.Errorf("note = %q", day.Note)
	}
}

func TestRunAgentToolErrorIsFedBackToModel(t *testing.T) {
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			return sseResponse(toolCallResponse("call_bad", "write_diary", `{}`)), nil
		}
		return sseResponse(completionResponse("修正了")), nil
	})

	rec := &recordingEmitter{}
	RunAgent(context.Background(), ChatRequest{
		Prompt: "记一下", Model: "qwen-plus", BaseURL: "https://test.local/v1", APIKey: "key",
	}, rec)

	wantTool := "event: tool\ndata: {\"name\":\"write_diary\",\"result\":\"Error: date: required\\n Please fix your mistakes.\"}\n\n"
	if rec.events[1] != wantTool {
		t.Fatalf("tool event = %q, want %q", rec.events[1], wantTool)
	}
	if rec.events[2] != "event: message\ndata: 修正了\n\n" {
		t.Errorf("message event = %q", rec.events[2])
	}
	if calls != 2 {
		t.Fatalf("model called %d times, want 2", calls)
	}
}

func TestRunAgentPlainText(t *testing.T) {
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		calls++
		return sseResponse(completionResponse("直接回答")), nil
	})

	rec := &recordingEmitter{}
	RunAgent(context.Background(), ChatRequest{
		Prompt: "p", Model: "qwen-plus", BaseURL: "https://test.local/v1", APIKey: "key",
	}, rec)

	want := "event: message\ndata: 直接回答\n\nevent: done\ndata: [DONE]\n\n"
	if rec.String() != want {
		t.Fatalf("events = %q, want %q", rec.String(), want)
	}
	if calls != 1 {
		t.Fatalf("model called %d times, want 1", calls)
	}
}

func TestRunAgentRecursionLimit(t *testing.T) {
	calls := 0
	stubTransport(t, func(req *http.Request) (*http.Response, error) {
		calls++
		return sseResponse(toolCallResponse("call_x", "get_time", "{}")), nil
	})

	rec := &recordingEmitter{}
	RunAgent(context.Background(), ChatRequest{
		Prompt: "p", Model: "qwen-plus", BaseURL: "https://test.local/v1", APIKey: "key",
	}, rec)

	if calls != maxAgentRounds {
		t.Fatalf("model called %d times, want %d", calls, maxAgentRounds)
	}
	wantErr := "event: error\ndata: Recursion limit of 10 reached without hitting a stop condition. You can increase the limit by setting the \"recursionLimit\" config key.\n\n"
	if rec.events[len(rec.events)-2] != wantErr {
		t.Errorf("error event = %q, want %q", rec.events[len(rec.events)-2], wantErr)
	}
	if rec.events[len(rec.events)-1] != "event: done\ndata: [DONE]\n\n" {
		t.Errorf("last event = %q", rec.events[len(rec.events)-1])
	}
}

// ──────────────────── 载荷格式化 ────────────────────

func TestJSONPayloadMatchesJSONStringify(t *testing.T) {
	got := jsonPayload(toolResultEvent{Name: "get_memory", Result: "a<b>&c\"d"})
	want := `{"name":"get_memory","result":"a<b>&c\"d"}`
	if got != want {
		t.Fatalf("payload = %s, want %s", got, want)
	}
	if strings.HasSuffix(got, "\n") {
		t.Fatal("payload must not end with a newline")
	}
}

// ──────────────────── 上下文裁剪 ────────────────────

func TestTrimMessagesKeepsSystemAndRecent(t *testing.T) {
	messages := []llm.Message{{Role: "system", Content: "sys"}}
	for i := 0; i < 100; i++ {
		messages = append(messages, llm.Message{Role: "user", Content: strings.Repeat("x", 400)})
	}
	messages = append(messages, llm.Message{Role: "user", Content: "最新问题"})

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
	messages := []llm.Message{
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
