package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"memo/internal/ai"
	"memo/internal/response"
)

// registerBookAgentRoutes mounts POST /api/book-agent (multi agent streaming
// writing assistant).
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
