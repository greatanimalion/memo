package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"memo/internal/ai/agent"
	"memo/internal/ai/service"
	"memo/internal/response"
)

// chatService 是 HTTP 协议层之下的业务入口。
var chatService = service.ChatService{}

// startSSE 以统一协议启动流式响应：
//   - 先写一条 `: connected` 注释，确保连接立即建立
//   - 再开启 15s 心跳（`: keep-alive`），防止代理层按空闲超时断开
//
// 返回的 stop 需在 handler 结束时调用。
func startSSE(w http.ResponseWriter) (*response.SSE, func()) {
	sse := response.StartSSE(w)
	sse.Comment("connected")
	return sse, sse.Heartbeat(15 * time.Second)
}

// RegisterChatRoutes 挂载流式 AI 端点：
//
//	POST /api/chat-stream
//	POST /api/chat-agent
//	GET  /api/chat-cancel
//	POST /api/chat/tasks            后台启动聊天任务，立即返回 taskId
//	GET  /api/chat/tasks/{id}       按 seq 拉取任务状态与事件
//	POST /api/chat/tasks/{id}/cancel
//	GET  /api/chat/active           查询某会话进行中的任务
func RegisterChatRoutes(api chi.Router) {
	api.Post("/chat-stream", chatStreamHandler)
	api.Post("/chat-agent", chatAgentHandler)
	api.Get("/chat-cancel", chatCancelHandler)
	// 任务化：切页 / 整页刷新后凭 taskId 重放事件，恢复正在生成的回答
	api.Post("/chat/tasks", chatTaskStartHandler)
	api.Get("/chat/tasks/{id}", chatTaskStatusHandler)
	api.Post("/chat/tasks/{id}/cancel", chatTaskCancelHandler)
	api.Get("/chat/active", chatActiveTaskHandler)
}

// RegisterBookAgentRoutes 挂载写书相关端点：
//
//	POST /api/book-agent              同步 SSE（兼容旧前端）
//	POST /api/book-agent/tasks        后台启动任务，立即返回 taskId
//	GET  /api/book-agent/tasks/{id}   按 seq 拉取任务状态与事件
//	POST /api/book-agent/tasks/{id}/cancel
//	GET  /api/book-agent/active       查询某书进行中的任务
func RegisterBookAgentRoutes(api chi.Router) {
	api.Post("/book-agent", bookAgentHandler)
	api.Post("/book-agent/tasks", bookAgentTaskStartHandler)
	api.Get("/book-agent/tasks/{id}", bookAgentTaskStatusHandler)
	api.Post("/book-agent/tasks/{id}/cancel", bookAgentTaskCancelHandler)
	api.Get("/book-agent/active", bookAgentActiveTaskHandler)
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
	sse, stop := startSSE(w)
	defer stop()
	chatService.ChatStream(r.Context(), req, sse)
	sse.End()
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
	sse, stop := startSSE(w)
	defer stop()
	chatService.Agent(r.Context(), req, sse)
	sse.End()
}

// chatCancelHandler 中止由 requestId 注册的进行中的请求。
func chatCancelHandler(w http.ResponseWriter, r *http.Request) {
	requestID := r.URL.Query().Get("requestId")
	if requestID == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing requestId"})
		return
	}
	if !chatService.Abort(requestID) {
		response.Raw(w, http.StatusNotFound, map[string]any{"error": "未找到对应的请求"})
		return
	}
	log.Printf("请求已取消: %s", requestID)
	writeChatJSON(w, http.StatusOK, chatCancelAck{Success: true, Message: "请求已取消"})
}

// bookAgentHandler 校验请求体后，运行多 Agent 写书工作流。
func bookAgentHandler(w http.ResponseWriter, r *http.Request) {
	var req agent.BookAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing prompt, bookId, model, or apiKey"})
		return
	}
	if req.Prompt == "" || req.BookID == "" || req.Model == "" || req.APIKey == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing prompt, bookId, model, or apiKey"})
		return
	}
	if strings.TrimSpace(req.BaseURL) == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing baseUrl"})
		return
	}

	sse, stop := startSSE(w)
	defer stop()
	chatService.BookAgent(r.Context(), req, sse)
	sse.End()
}

// ──────────────────── 后台写书任务 ────────────────────

// bookAgentTaskStartHandler 在服务器后台启动写书任务，立即返回 taskId。
// 任务不依赖 HTTP 连接，前端可随时凭 taskId 拉取事件恢复现场。
func bookAgentTaskStartHandler(w http.ResponseWriter, r *http.Request) {
	var req agent.BookAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing prompt, bookId, model, or apiKey"})
		return
	}
	if req.Prompt == "" || req.BookID == "" || req.Model == "" || req.APIKey == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing prompt, bookId, model, or apiKey"})
		return
	}
	if strings.TrimSpace(req.BaseURL) == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing baseUrl"})
		return
	}

	task := service.BookAgentTasks().Start(req)
	writeChatJSON(w, http.StatusOK, map[string]any{"taskId": task.ID, "status": "running"})
}

// bookAgentTaskStatusHandler 拉取任务状态与 from 之后的事件（分页 limit）。
func bookAgentTaskStatusHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	from, _ := strconv.Atoi(r.URL.Query().Get("from"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	snap, ok := service.BookAgentTasks().Snapshot(id, from, limit)
	if !ok {
		response.Raw(w, http.StatusNotFound, map[string]any{"error": "未找到对应的写书任务"})
		return
	}
	writeChatJSON(w, http.StatusOK, snap)
}

// bookAgentTaskCancelHandler 取消后台写书任务。
func bookAgentTaskCancelHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !service.BookAgentTasks().Cancel(id) {
		response.Raw(w, http.StatusNotFound, map[string]any{"error": "未找到对应的写书任务"})
		return
	}
	writeChatJSON(w, http.StatusOK, chatCancelAck{Success: true, Message: "任务已取消"})
}

// bookAgentActiveTaskHandler 查询某本书当前进行中的任务，用于切页/刷新后恢复。
func bookAgentActiveTaskHandler(w http.ResponseWriter, r *http.Request) {
	bookID := strings.TrimSpace(r.URL.Query().Get("bookId"))
	if bookID == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing bookId"})
		return
	}
	id, ok := service.BookAgentTasks().ActiveByBook(bookID)
	if !ok {
		writeChatJSON(w, http.StatusOK, map[string]any{"taskId": ""})
		return
	}
	writeChatJSON(w, http.StatusOK, map[string]any{"taskId": id})
}

// ──────────────────── 后台聊天任务 ────────────────────

// chatTaskStartBody 在 ChatRequest 之外补充是否启用工具与所属会话。
type chatTaskStartBody struct {
	agent.ChatRequest
	Agent     bool   `json:"agent"`
	SessionID string `json:"sessionId"`
}

// chatTaskStartHandler 在服务器后台启动聊天任务，立即返回 taskId。
// 任务不依赖 HTTP 连接，前端可随时凭 taskId 拉取事件恢复现场。
func chatTaskStartHandler(w http.ResponseWriter, r *http.Request) {
	var body chatTaskStartBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Invalid request body"})
		return
	}
	if body.Prompt == "" || body.Model == "" || body.APIKey == "" || body.SessionID == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{
			"error": "Missing prompt, model, apiKey, or sessionId",
		})
		return
	}
	if strings.TrimSpace(body.BaseURL) == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing baseUrl"})
		return
	}
	task := service.ChatTasks().Start(body.SessionID, body.RequestID, body.Agent, body.ChatRequest)
	writeChatJSON(w, http.StatusOK, map[string]any{"taskId": task.ID, "status": "running"})
}

// chatTaskStatusHandler 拉取任务状态与 from 之后的事件（分页 limit）。
func chatTaskStatusHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	from, _ := strconv.Atoi(r.URL.Query().Get("from"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	snap, ok := service.ChatTasks().Snapshot(id, from, limit)
	if !ok {
		response.Raw(w, http.StatusNotFound, map[string]any{"error": "未找到对应的聊天任务"})
		return
	}
	writeChatJSON(w, http.StatusOK, snap)
}

// chatTaskCancelHandler 取消后台聊天任务。
func chatTaskCancelHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !service.ChatTasks().Cancel(id) {
		response.Raw(w, http.StatusNotFound, map[string]any{"error": "未找到对应的聊天任务"})
		return
	}
	writeChatJSON(w, http.StatusOK, chatCancelAck{Success: true, Message: "任务已取消"})
}

// chatActiveTaskHandler 查询某会话当前进行中的任务，用于切页 / 刷新后恢复。
func chatActiveTaskHandler(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "Missing sessionId"})
		return
	}
	id, ok := service.ChatTasks().ActiveBySession(sessionID)
	if !ok {
		writeChatJSON(w, http.StatusOK, map[string]any{"taskId": ""})
		return
	}
	writeChatJSON(w, http.StatusOK, map[string]any{"taskId": id})
}

func decodeChatBody(w http.ResponseWriter, r *http.Request) (agent.ChatRequest, bool) {
	var req agent.ChatRequest
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
