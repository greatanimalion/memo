package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"memo/internal/ai/llm"
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
	// 工具结果回放时，带 tool_calls 的 assistant 消息必须排在 role=tool 之前，
	// 否则 OpenAI 兼容接口会报 “tool must be a response to a preceding tool_calls”。
	run := &bookAgentRun{prompt: "写一本书", bookID: "book-1"}
	run.board = &db.BookAgentState{
		BookID:   "book-1",
		Plan:     "大纲",
		Progress: json.RawMessage("[]"),
		Issues:   json.RawMessage("[]"),
	}
	run.pendingToolMsg = &llm.Message{
		Role: "assistant",
		ToolCalls: []llm.ToolCall{{
			ID:       "call_1",
			Type:     "function",
			Function: llm.ToolCallFunction{Name: "get_book_info", Arguments: "{}"},
		}},
	}
	run.pendingToolResults = []llm.Message{{
		Role:       "tool",
		Content:    `{"title":"书"}`,
		ToolCallID: "call_1",
		Name:       "get_book_info",
	}}

	msgs := run.buildAgentMessages("writer")
	assistantIdx, toolIdx := -1, -1
	for i, m := range msgs {
		if m.Role == "assistant" && len(m.ToolCalls) > 0 && assistantIdx < 0 {
			assistantIdx = i
		}
		if m.Role == "tool" && toolIdx < 0 {
			toolIdx = i
		}
	}
	if assistantIdx < 0 || toolIdx < 0 {
		t.Fatalf("messages missing assistant tool_calls or tool result: %+v", msgs)
	}
	if assistantIdx > toolIdx {
		t.Fatalf("tool_calls must precede tool result: assistant=%d tool=%d", assistantIdx, toolIdx)
	}
}

func TestBookAgentRouteDoesNotReplayAckTurn(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "路由跳转测试"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}

	calls := 0
	stubTransport(t, func(*http.Request) (*http.Response, error) {
		calls++
		content := dsmlInvoke("route", map[string]any{"target": "end"})
		return sseResponse(sseDelta(content) + "data: [DONE]\n\n"), nil
	})

	em := &recordingEmitter{}
	RunBookAgent(context.Background(), BookAgentRequest{
		Prompt: "写一本书", BookID: book.ID, Model: "deepseek-chat",
		BaseURL: "https://test.local/v1", APIKey: "test-key",
	}, em)

	// route 之后应直接跳转，不能再用工具回执重跑当前 Agent。
	if calls != 1 {
		t.Fatalf("expected 1 model call after route, got %d", calls)
	}
	if !strings.Contains(em.String(), "event: done\ndata: [DONE]") {
		t.Fatalf("stream missing done event:\n%s", em.String())
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
	if bookAgentToolAllowed("architect", "save_chapter") {
		t.Fatal("architect must not be allowed save_chapter")
	}
	if !bookAgentToolAllowed("character", "get_chapter") {
		t.Fatal("character should be allowed get_chapter")
	}
	if bookAgentToolAllowed("character", "save_chapter") {
		t.Fatal("character must not be allowed save_chapter")
	}
	if !bookAgentToolAllowed("writer", "save_chapter") {
		t.Fatal("writer should be allowed save_chapter")
	}
	if bookAgentToolAllowed("guard", "update_chapter") {
		t.Fatal("guard must not be allowed update_chapter")
	}
	if bookAgentToolAllowed("unknown", "route") {
		t.Fatal("unknown role must not be allowed anything")
	}
}

func TestGuardVerdict(t *testing.T) {
	run := &bookAgentRun{}
	cases := map[string]string{
		"检查完毕。\n结论: 通过":   "通过",
		"发现问题。\n结论：不通过":   "不通过",
		"尚未读取数据。\n结论: 待检": "待检",
		"未通过项（如有）: 无":     "",
	}
	for content, want := range cases {
		if got := run.guardVerdict(content); got != want {
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

func TestParseOutlineChaptersPlainFormats(t *testing.T) {
	outline := "第1章 开端\n概要：主角登场\n\n" +
		"**第2章、冲突**\n- 简介: 矛盾升级\n\n" +
		"### 第三章：结局\n- 内容：收束"
	chapters := parseOutlineChapters(outline)
	if len(chapters) != 3 {
		t.Fatalf("expected 3 chapters, got %d (%+v)", len(chapters), chapters)
	}
	wantTitles := []string{"开端", "冲突", "结局"}
	wantSummaries := []string{"主角登场", "矛盾升级", "收束"}
	for i := range chapters {
		if chapters[i].Title != wantTitles[i] || chapters[i].Summary != wantSummaries[i] {
			t.Fatalf("chapter %d = %+v, want title %q summary %q",
				i, chapters[i], wantTitles[i], wantSummaries[i])
		}
	}
}

func TestRoutePhaseGuardVerdicts(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "路由判定"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}
	newRun := func() *bookAgentRun {
		r := &bookAgentRun{bookID: book.ID, currentPhase: "guard", chapterID: "ch-1"}
		r.board = &db.BookAgentState{
			BookID:   book.ID,
			Progress: json.RawMessage("[]"),
			Issues:   json.RawMessage("[]"),
		}
		r.outlineChapters = []outlineChapter{{Title: "第一章"}, {Title: "第二章"}}
		r.lastDraft = strings.Repeat("定稿正文内容。", 20)
		r.lastDraftCursor = 0
		return r
	}

	// 通过：定稿写回台账并推进章节游标后回到 orchestrator。
	r := newRun()
	r.lastVerdict = "通过"
	if got := r.routePhase(); got != "orchestrator" {
		t.Fatalf("通过 routed to %q, want orchestrator", got)
	}
	if r.completedChapters != 1 {
		t.Fatalf("completedChapters = %d, want 1", r.completedChapters)
	}

	// 不通过：退回 writer 返工，且不推进游标。
	r = newRun()
	r.lastVerdict = "不通过"
	if got := r.routePhase(); got != "writer" {
		t.Fatalf("不通过 routed to %q, want writer", got)
	}
	if !r.reworkPending || r.completedChapters != 0 {
		t.Fatalf("reworkPending=%v completedChapters=%d", r.reworkPending, r.completedChapters)
	}

	// 无结论标记：先重检一次。
	r = newRun()
	r.lastVerdict = ""
	if got := r.routePhase(); got != "guard" {
		t.Fatalf("missing verdict routed to %q, want guard", got)
	}
}

func TestToolSaveChapterUpdatesCurrentInsteadOfDuplicating(t *testing.T) {
	book, err := db.CreateBook(&db.Book{ID: db.NewID(), Title: "保存章节测试"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}
	run := &bookAgentRun{bookID: book.ID, chapterOffset: 4}
	if _, err := run.toolSaveChapter(saveChapterArgs{
		Title: "第五章", Content: strings.Repeat("初始正文。", 40),
	}); err != nil {
		t.Fatalf("save: %v", err)
	}
	firstID := run.chapterID
	if firstID == "" {
		t.Fatal("chapter not created")
	}
	if _, err := run.toolSaveChapter(saveChapterArgs{
		Title: "第五章", Content: strings.Repeat("修订正文。", 40),
	}); err != nil {
		t.Fatalf("resave: %v", err)
	}
	if run.chapterID != firstID {
		t.Fatalf("resave created a new chapter: %q != %q", run.chapterID, firstID)
	}

	metas, err := db.GetChapterMetaByBookID(book.ID)
	if err != nil {
		t.Fatalf("list chapters: %v", err)
	}
	if len(metas) != 1 {
		t.Fatalf("expected 1 chapter row, got %d", len(metas))
	}
	if metas[0].Order != 5 {
		t.Fatalf("default order = %d, want 5 (offset+1)", metas[0].Order)
	}
	if metas[0].WordCount == 0 {
		t.Fatal("wordCount not updated")
	}
}

func TestRoutePhaseIgnoresIllegalTransition(t *testing.T) {
	// writer 只能去 guard；writer -> architect 属于非法跳转，应被忽略并走兜底。
	r := &bookAgentRun{currentPhase: "writer", pendingRoute: "architect", chapterID: "ch-1"}
	if got := r.routePhase(); got != "guard" {
		t.Fatalf("illegal transition routed to %q, want guard", got)
	}

	// architect 只能去 orchestrator/character/writer；architect -> architect 应被忽略。
	r = &bookAgentRun{currentPhase: "architect", pendingRoute: "architect"}
	if got := r.routePhase(); got != "orchestrator" {
		t.Fatalf("illegal transition routed to %q, want orchestrator", got)
	}
}

func TestRoutePhaseStopsWriterWithoutDraft(t *testing.T) {
	// Writer 连续未产出正文时，不能在 writer ↔ guard 之间反复兜底跳转。
	r := &bookAgentRun{
		currentPhase:  "writer",
		pendingRoute:  "guard",
		writerRetries: 1,
		writerMisses:  bookAgentMaxWriterMisses,
	}
	if got := r.routePhase(); got != bookAgentEnd {
		t.Fatalf("writer without draft routed to %q, want %q", got, bookAgentEnd)
	}
	if !r.aborted {
		t.Fatal("run not marked aborted after writer gave up")
	}
}

func TestEnterNodeBudget(t *testing.T) {
	r := &bookAgentRun{}
	for i := 0; i < bookAgentMaxNodeCallsPerChapter; i++ {
		if !r.enterNode("writer") {
			t.Fatalf("enterNode stopped too early at %d", i)
		}
	}
	if r.enterNode("writer") {
		t.Fatal("node budget not enforced")
	}
}

func TestTrackStallDetectsNoProgress(t *testing.T) {
	r := &bookAgentRun{}
	if !r.trackStall() {
		t.Fatal("first checkpoint should count as progress")
	}
	for i := 0; i < bookAgentMaxStalledCalls-1; i++ {
		if !r.trackStall() {
			t.Fatalf("stall detected too early at %d", i)
		}
	}
	if r.trackStall() {
		t.Fatal("stall limit not enforced")
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
	got, err := run.toolGetChapter(getChapterArgs{ChapterID: chapter.ID})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "第一章") || !strings.Contains(got, "主角走入雨夜") {
		t.Fatalf("chapter content missing: %q", got)
	}

	latest, err := run.toolGetChapter(getChapterArgs{})
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
	msg := &llm.Message{Role: "assistant", ToolCalls: []llm.ToolCall{{
		ID:       "call_1",
		Type:     "function",
		Function: llm.ToolCallFunction{Name: "get_book_info", Arguments: "{}"},
	}}}
	if !hasValidBookToolCalls(msg) {
		t.Fatal("tool calls with empty arguments must still be executed")
	}
}
