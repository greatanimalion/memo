package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/ai"
	"memo/internal/response"
)

// registerChatRoutes mounts the streaming AI endpoints:
//
//	POST /api/chat-stream
//	POST /api/chat-agent
//	GET  /api/chat-cancel
func registerChatRoutes(api chi.Router) {
	api.Post("/chat-stream", chatStreamHandler)
	api.Post("/chat-agent", chatAgentHandler)
	api.Get("/chat-cancel", chatCancelHandler)
}

// chatStreamHandler validates the body, then answers with a plain SSE stream.
func chatStreamHandler(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeChatBody(w, r)
	if !ok {
		return
	}
	if req.Prompt == "" || req.Model == "" || req.APIKey == "" || req.RequestID == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{
			"error": "Missing prompt, model, apiKey, or requestId",
		})
		return
	}
	ai.RunChatStream(r.Context(), req, response.StartSSE(w))
}

// chatAgentHandler validates the body, then runs the tool calling loop.
func chatAgentHandler(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeChatBody(w, r)
	if !ok {
		return
	}
	if req.Prompt == "" || req.Model == "" || req.APIKey == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{
			"error": "Missing prompt, model, or apiKey",
		})
		return
	}
	ai.RunAgent(r.Context(), req, response.StartSSE(w))
}

// chatCancelHandler aborts an in flight request registered by requestId.
func chatCancelHandler(w http.ResponseWriter, r *http.Request) {
	requestID := r.URL.Query().Get("requestId")
	if requestID == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing requestId"})
		return
	}
	if !ai.AbortRequest(requestID) {
		response.Raw(w, http.StatusNotFound, map[string]any{"error": "未找到对应的请求"})
		return
	}
	log.Printf("请求已取消: %s", requestID)
	writeChatJSON(w, http.StatusOK, chatCancelAck{Success: true, Message: "请求已取消"})
}

func decodeChatBody(w http.ResponseWriter, r *http.Request) (ai.ChatRequest, bool) {
	var req ai.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Invalid request body"})
		return req, false
	}
	return req, true
}

type chatCancelAck struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// writeChatJSON keeps the field order of Express' res.json({success, message}).
func writeChatJSON(w http.ResponseWriter, status int, payload any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(bytes.TrimRight(buf.Bytes(), "\n"))
}
