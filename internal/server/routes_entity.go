package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/response"
)

// registerEntityRoutes mounts every CRUD endpoint that the previous Express
// app served under /api (memory, diary, session, agent, book, chapter, volume,
// bookAgent).
func registerEntityRoutes(api chi.Router) {
	registerMemoryRoutes(api)
	registerDiaryRoutes(api)
	registerSessionRoutes(api)
	registerAgentRoutes(api)
	registerBookRoutes(api)
	registerBookAgentEntityRoutes(api)
	registerUsageRoutes(api)
}

// entDecode reads a JSON body into T. An empty body yields the zero value,
// mirroring Express' json middleware which turns it into {}.
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
