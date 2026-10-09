package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"memo/internal/db"
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "memo-ai-test-")
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

// ──────────────────── 辅助工具 ────────────────────

type recordingEmitter struct {
	events []string
}

func (r *recordingEmitter) Write(event, data string) {
	r.events = append(r.events, "event: "+event+"\ndata: "+data+"\n\n")
}

func (r *recordingEmitter) String() string { return strings.Join(r.events, "") }

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func stubTransport(t *testing.T, fn roundTripFunc) {
	t.Helper()
	orig := http.DefaultTransport
	http.DefaultTransport = fn
	t.Cleanup(func() { http.DefaultTransport = orig })
}

func sseResponse(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func completionResponse(content string) string {
	payload := map[string]any{
		"choices": []any{map[string]any{
			"message":       map[string]any{"role": "assistant", "content": content},
			"finish_reason": "stop",
		}},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func toolCallResponse(id, name, args string) string {
	payload := map[string]any{
		"choices": []any{map[string]any{"message": map[string]any{
			"role":    "assistant",
			"content": "",
			"tool_calls": []any{map[string]any{
				"id":       id,
				"type":     "function",
				"function": map[string]any{"name": name, "arguments": args},
			}},
		}}},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

type sentRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream"`
	Temperature float64   `json:"temperature"`
	Tools       []Tool    `json:"tools"`
}

func decodeSent(t *testing.T, raw []byte) sentRequest {
	t.Helper()
	var sent sentRequest
	if err := json.Unmarshal(raw, &sent); err != nil {
		t.Fatalf("decode model request: %v (%s)", err, raw)
	}
	return sent
}

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
	if AbortRequest("cancel-stream-1") {
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
	if AbortRequest("cancel-agent-1") {
		t.Fatal("requestId was not unregistered after the run")
	}
}

func TestAbortRequestCancelsAndForgets(t *testing.T) {
	inner, innerCancel := context.WithCancel(context.Background())
	defer innerCancel()
	RegisterAbort("abort-target", innerCancel)
	if !AbortRequest("abort-target") {
		t.Fatal("expected the registered request to be aborted")
	}
	if inner.Err() == nil {
		t.Fatal("context was not cancelled")
	}
	if AbortRequest("abort-target") {
		t.Fatal("second abort should miss (404 branch)")
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
	want := []Message{
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
	wantMsgs := []Message{
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
	if len(first.Tools) != 3 {
		t.Fatalf("first round sent %d tools, want 3", len(first.Tools))
	}
	wantTools := []string{"get_time", "write_diary", "get_memory"}
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

	diary, err := db.GetDiary("2026-09-30")
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

// ──────────────────── 工具 ────────────────────

func TestGetTimeToolFormat(t *testing.T) {
	got, err := executeTool("get_time", "{}")
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
	if _, err := executeTool("nope", "{}"); err == nil || err.Error() != `Tool "nope" not found.` {
		t.Fatalf("err = %v", err)
	}
}

func TestWriteDiaryTool(t *testing.T) {
	got, err := executeTool("write_diary", `{"date":"2026-01-05","todos":[{"text":"买菜"},{"text":"跑步"}],"note":""}`)
	if err != nil {
		t.Fatal(err)
	}
	if got != "日记记录成功，日期：2026-01-05" {
		t.Fatalf("result = %q", got)
	}
	if _, err := executeTool("write_diary", `{}`); err == nil {
		t.Fatal("missing date should fail validation")
	}
	if _, err := executeTool("write_diary", `not json`); err == nil {
		t.Fatal("invalid arguments should fail")
	}
}

func TestGetMemoryTool(t *testing.T) {
	if _, err := db.DB().Exec("DELETE FROM memorys"); err != nil {
		t.Fatal(err)
	}

	got, err := executeTool("get_memory", `{}`)
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

	recent, err := executeTool("get_memory", `{}`)
	if err != nil {
		t.Fatal(err)
	}
	wantRecent := "[NEW Report] (id: m-new)\n[旧的会议记录] (id: m-old)"
	if recent != wantRecent {
		t.Fatalf("recent = %q, want %q", recent, wantRecent)
	}

	byKeyword, err := executeTool("get_memory", `{"keyword":"会议"}`)
	if err != nil {
		t.Fatal(err)
	}
	if byKeyword != "[旧的会议记录] (id: m-old)" {
		t.Fatalf("keyword match = %q", byKeyword)
	}

	caseInsensitive, err := executeTool("get_memory", `{"keyword":"REPort"}`)
	if err != nil {
		t.Fatal(err)
	}
	if caseInsensitive != "[NEW Report] (id: m-new)" {
		t.Fatalf("case insensitive match = %q", caseInsensitive)
	}

	none, err := executeTool("get_memory", `{"keyword":"不存在的关键词"}`)
	if err != nil {
		t.Fatal(err)
	}
	if none != "未找到匹配的记忆" {
		t.Fatalf("no match = %q", none)
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
