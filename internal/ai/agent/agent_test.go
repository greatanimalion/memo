package agent

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"memo/internal/ai/llm"
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "memo-agent-test-")
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
	Model       string        `json:"model"`
	Messages    []llm.Message `json:"messages"`
	Stream      bool          `json:"stream"`
	Temperature float64       `json:"temperature"`
	Tools       []llm.Tool    `json:"tools"`
}

func decodeSent(t *testing.T, raw []byte) sentRequest {
	t.Helper()
	var sent sentRequest
	if err := json.Unmarshal(raw, &sent); err != nil {
		t.Fatalf("decode model request: %v (%s)", err, raw)
	}
	return sent
}
