package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/response"
)

// registerEntityRoutes 挂载之前 Express 应用在 /api 下提供的所有 CRUD
// 端点（memory、diary、session、agent、book、chapter、volume、bookAgent）。
func registerEntityRoutes(api chi.Router) {
	registerMemoryRoutes(api)
	registerDiaryRoutes(api)
	registerSessionRoutes(api)
	registerAgentRoutes(api)
	registerBookRoutes(api)
	registerBookAgentEntityRoutes(api)
	registerUsageRoutes(api)
}

// entDecode 将 JSON 请求体读入 T。空请求体返回零值，
// 与 Express 的 json 中间件将其转换为 {} 的行为一致。
func entDecode[T any](w http.ResponseWriter, r *http.Request) (T, bool) {
	var v T
	if r.Body == nil {
		return v, true
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&v); err != nil && !errors.Is(err, io.EOF) {
		response.Raw(w, http.StatusBadRequest, map[string]any{"code": 400, "error": "Invalid request body"})
		return v, false
	}
	return v, true
}

func entPath(r *http.Request, key string) string {
	return chi.URLParam(r, key)
}
