package server

import (
	"github.com/go-chi/chi/v5"

	"memo/internal/ai/handler"
)

// registerBookAgentRoutes 挂载 POST /api/book-agent，实际实现已迁移到
// internal/ai/handler。
func registerBookAgentRoutes(api chi.Router) {
	handler.RegisterBookAgentRoutes(api)
}

// 以下为迁移前的原实现（http 处理逻辑已移至 internal/ai/handler），
// 按约束保留为注释，不再编译。
/*
import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"memo/internal/ai"
	"memo/internal/response"
)

// registerBookAgentRoutes 挂载 POST /api/book-agent（多智能体流式写作助手）。
func registerBookAgentRoutes(api chi.Router) {
	api.Post("/book-agent", bookAgent)
}

func bookAgent(w http.ResponseWriter, r *http.Request) {
	var req ai.BookAgentRequest
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

	sse := response.StartSSE(w)
	ai.RunBookAgent(r.Context(), req, sse)
	sse.End()
}
*/
