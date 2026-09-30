package response

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// Success writes the envelope used by the previous Express handlers:
// {"code":200,"data":...,"message":"success"}
func Success(w http.ResponseWriter, data any, message string) {
	if message == "" {
		message = "success"
	}
	write(w, http.StatusOK, map[string]any{
		"code":    200,
		"data":    data,
		"message": message,
	})
}

// Created mirrors Express' 201 response.
func Created(w http.ResponseWriter, data any, message string) {
	if message == "" {
		message = "created"
	}
	write(w, http.StatusCreated, map[string]any{
		"code":    201,
		"data":    data,
		"message": message,
	})
}

// Fail mirrors errorResponse: {"code":status,"error":message}
func Fail(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]any{
		"code":  status,
		"error": message,
	})
}

// Raw writes a plain JSON body (used by the AI endpoints' validation errors).
func Raw(w http.ResponseWriter, status int, body map[string]any) {
	write(w, status, body)
}

func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// SSE is a Server-Sent Events writer compatible with the previous
// `sseWrite(res, event, data)` helper.
type SSE struct {
	w http.ResponseWriter
	f http.Flusher
}

// StartSSE switches the response into event-stream mode.
func StartSSE(w http.ResponseWriter) *SSE {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	s := &SSE{w: w}
	if f, ok := w.(http.Flusher); ok {
		s.f = f
	}
	return s
}

func (s *SSE) Write(event, data string) {
	if s == nil || s.w == nil {
		return
	}
	_, _ = fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, data)
	if s.f != nil {
		s.f.Flush()
	}
}

func (s *SSE) End() {
	if s == nil || s.w == nil {
		return
	}
	if f, ok := s.w.(http.Flusher); ok {
		f.Flush()
	}
}
