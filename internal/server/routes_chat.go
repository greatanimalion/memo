package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"memo/internal/ai"
	"memo/internal/response"
)

// registerChatRoutes 挂载流式 AI 端点：
//
//	POST /api/chat-stream
//	POST /api/chat-agent
//	GET  /api/chat-cancel
func registerChatRoutes(api chi.Router) {
	api.Post("/chat-stream", chatStreamHandler)
	api.Post("/chat-agent", chatAgentHandler)
	api.Get("/chat-cancel", chatCancelHandler)
}

// chatStreamHandler 校验请求体后，以纯 SSE 流作出响应。
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
	if strings.TrimSpace(req.BaseURL) == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{
			"error": "Missing baseUrl",
		})
		return
	}
	ai.RunChatStream(r.Context(), req, response.StartSSE(w))
}

// chatAgentHandler 校验请求体后，运行工具调用循环。
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
	if strings.TrimSpace(req.BaseURL) == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{
			"error": "Missing baseUrl",
		})
		return
	}
	ai.RunAgent(r.Context(), req, response.StartSSE(w))
}

// chatCancelHandler 中止由 requestId 注册的进行中的请求。
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

// writeChatJSON 保持与 Express res.json({success, message}) 相同的字段顺序。
func writeChatJSON(w http.ResponseWriter, status int, payload any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(bytes.TrimRight(buf.Bytes(), "\n"))
}
