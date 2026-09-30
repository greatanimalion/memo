package server

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"memo/internal/config"
	"memo/internal/db"
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "memo-e2e-*")
	if err != nil {
		panic(err)
	}
	_ = os.Setenv("MEMORY_DATA_DIR", dir)
	_ = os.Setenv("MEMORY_ENV", "development")
	if _, err := db.Open(); err != nil {
		panic(err)
	}
	code := m.Run()
	db.Close()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

type envelope struct {
	Code    int             `json:"code"`
	Data    json.RawMessage `json:"data"`
	Message string          `json:"message"`
	Error   string          `json:"error"`
}

func do(t *testing.T, srv *httptest.Server, method, path string, body any) (int, envelope) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, srv.URL+path, reader)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var env envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("%s %s: decode: %v", method, path, err)
	}
	return resp.StatusCode, env
}

func TestMemoryLifecycle(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	status, env := do(t, srv, http.MethodPost, "/api/memorys", map[string]any{
		"id": "m1", "title": "Notes", "isFolder": 0, "parentId": "root",
		"created": 1, "updated": 1, "visitedTime": time.Now().UnixMilli(), "size": 0,
	})
	if status != 201 {
		t.Fatalf("create memory status = %d (%s)", status, env.Error)
	}
	var created struct {
		FileURL string `json:"fileUrl"`
	}
	if err := json.Unmarshal(env.Data, &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if !strings.HasPrefix(created.FileURL, "/uploads/files/") {
		t.Fatalf("fileUrl = %q", created.FileURL)
	}
	rel := strings.TrimPrefix(created.FileURL, "/uploads/files/")
	if _, err := os.Stat(filepath.Join(config.FilesDir(), filepath.FromSlash(rel))); err != nil {
		t.Fatalf("content file missing: %v", err)
	}

	status, env = do(t, srv, http.MethodPut, "/api/memorys/m1", map[string]any{
		"title": "Notes2", "fileUrl": created.FileURL, "parentId": "root", "content": "hello world",
	})
	if status != 200 {
		t.Fatalf("update memory status = %d (%s)", status, env.Error)
	}
	var updated struct {
		Size int64 `json:"size"`
	}
	_ = json.Unmarshal(env.Data, &updated)
	if updated.Size != int64(len("hello world")) {
		t.Fatalf("updated size = %d", updated.Size)
	}

	status, env = do(t, srv, http.MethodGet, "/api/memorys/get_children/root", nil)
	if status != 200 || !bytes.Contains(env.Data, []byte("m1")) {
		t.Fatalf("children status=%d data=%s", status, env.Data)
	}

	if status, env = do(t, srv, http.MethodPost, "/api/memory/star/m1", nil); status != 200 {
		t.Fatalf("star status=%d (%s)", status, env.Error)
	}
	if status, env = do(t, srv, http.MethodGet, "/api/memorys_starred", nil); status != 200 || !bytes.Contains(env.Data, []byte("m1")) {
		t.Fatalf("starred status=%d data=%s", status, env.Data)
	}

	if status, env = do(t, srv, http.MethodDelete, "/api/memorys/m1", nil); status != 200 {
		t.Fatalf("delete status=%d (%s)", status, env.Error)
	}
	if _, err := os.Stat(filepath.Join(config.FilesDir(), filepath.FromSlash(rel))); !os.IsNotExist(err) {
		t.Fatalf("content file should be removed, stat err = %v", err)
	}
}

func TestDiaryUpsert(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	payload := map[string]any{
		"id": "2026-09-30",
		"monthDiarys": map[string]any{
			"2026-09-30": map[string]any{
				"todos": []map[string]any{{"id": 1, "text": "write", "completed": false}},
				"note":  "hello",
			},
		},
	}
	if status, env := do(t, srv, http.MethodPut, "/api/diarys/2026-09-30", payload); status != 200 {
		t.Fatalf("diary put status=%d (%s)", status, env.Error)
	}
	status, env := do(t, srv, http.MethodGet, "/api/diarys/2026-09-30", nil)
	if status != 200 || !bytes.Contains(env.Data, []byte(`"note":"hello"`)) {
		t.Fatalf("diary get status=%d data=%s", status, env.Data)
	}
}

func TestSessionRoundTrip(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	status, env := do(t, srv, http.MethodPost, "/api/sessions", map[string]any{
		"id": "s1", "title": "chat", "lastUpdated": time.Now().UnixMilli(),
		"messages": []map[string]any{{"role": "user", "content": "hi"}},
	})
	if status != 201 {
		t.Fatalf("create session status=%d (%s)", status, env.Error)
	}
	status, env = do(t, srv, http.MethodGet, "/api/sessions/s1", nil)
	if status != 200 {
		t.Fatalf("get session status=%d", status)
	}
	var got struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(env.Data, &got); err != nil {
		t.Fatalf("messages not an array: %s", env.Data)
	}
	if len(got.Messages) != 1 || got.Messages[0]["content"] != "hi" {
		t.Fatalf("messages = %v", got.Messages)
	}
}

func TestBookChapterAndSearch(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	status, env := do(t, srv, http.MethodPost, "/api/books", map[string]any{"title": "My Book", "description": "d"})
	if status != 201 {
		t.Fatalf("create book status=%d (%s)", status, env.Error)
	}
	var detail struct {
		ID       string `json:"id"`
		Chapters []any  `json:"chapters"`
	}
	if err := json.Unmarshal(env.Data, &detail); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if len(detail.Chapters) != 1 {
		t.Fatalf("default chapter missing: %s", env.Data)
	}

	status, env = do(t, srv, http.MethodPost, "/api/chapters", map[string]any{
		"bookId": detail.ID, "title": "Chapter 1", "content": "寻找关键线索", "order": 1,
	})
	if status != 201 {
		t.Fatalf("create chapter status=%d (%s)", status, env.Error)
	}

	status, env = do(t, srv, http.MethodPost, "/api/book/search", map[string]any{"bookId": detail.ID, "keyword": "关键线索"})
	if status != 200 || !bytes.Contains(env.Data, []byte("Chapter 1")) {
		t.Fatalf("search status=%d data=%s", status, env.Data)
	}

	status, env = do(t, srv, http.MethodGet, "/api/books/"+detail.ID+"/detail", nil)
	if status != 200 || !bytes.Contains(env.Data, []byte("Chapter 1")) {
		t.Fatalf("detail status=%d data=%s", status, env.Data)
	}
}

func TestUploadAndDeleteFile(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="pic.png"`)
	header.Set("Content-Type", "image/png")
	part, err := mw.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("\x89PNG\r\n\x1a\n"))
	_ = mw.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer resp.Body.Close()
	var env envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("upload decode: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("upload status=%d (%s)", resp.StatusCode, env.Error)
	}
	var uploaded struct {
		URL string `json:"url"`
	}
	_ = json.Unmarshal(env.Data, &uploaded)
	if !strings.HasPrefix(uploaded.URL, "/uploads/images/") {
		t.Fatalf("upload url = %q", uploaded.URL)
	}

	res, err := http.Get(srv.URL + uploaded.URL)
	if err != nil {
		t.Fatalf("get upload: %v", err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("static upload status=%d", res.StatusCode)
	}

	rel := strings.TrimPrefix(uploaded.URL, "/uploads/")
	status, env := do(t, srv, http.MethodDelete, "/deleteFile", map[string]any{"filePath": rel})
	if status != 200 || len(env.Data) == 0 || env.Data[0] != '[' {
		t.Fatalf("deleteFile status=%d data=%s", status, env.Data)
	}

	if status, env = do(t, srv, http.MethodGet, "/api/memorySize", nil); status != 200 {
		t.Fatalf("memorySize status=%d (%s)", status, env.Error)
	}
}

func TestBookAgentCRUD(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	status, env := do(t, srv, http.MethodPost, "/api/book-agents", map[string]any{
		"id": "ba1", "bookId": "b1", "title": "t", "messages": []any{}, "status": "running",
	})
	if status != 201 {
		t.Fatalf("create book-agent status=%d (%s)", status, env.Error)
	}
	status, env = do(t, srv, http.MethodGet, "/api/books/b1/agents", nil)
	if status != 200 || !bytes.Contains(env.Data, []byte("ba1")) {
		t.Fatalf("list book-agents status=%d data=%s", status, env.Data)
	}
	if status, env = do(t, srv, http.MethodDelete, "/api/books/b1/agents", nil); status != 200 {
		t.Fatalf("delete by book status=%d (%s)", status, env.Error)
	}
}

func TestAIValidation(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	if status, _ := do(t, srv, http.MethodPost, "/api/chat-stream", map[string]any{}); status != 400 {
		t.Fatalf("chat-stream empty body status=%d", status)
	}
	if status, _ := do(t, srv, http.MethodPost, "/api/chat-agent", map[string]any{"prompt": "p"}); status != 400 {
		t.Fatalf("chat-agent invalid body status=%d", status)
	}
	if status, _ := do(t, srv, http.MethodPost, "/api/book-agent", map[string]any{"prompt": "p"}); status != 400 {
		t.Fatalf("book-agent invalid body status=%d", status)
	}
}
