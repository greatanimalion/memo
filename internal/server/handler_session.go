package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/db"
	"memo/internal/response"
)

func registerSessionRoutes(api chi.Router) {
	api.Get("/sessions", sessionGetAll)
	api.Get("/sessions/{id}", sessionGetByID)
	api.Post("/sessions", sessionCreate)
	api.Put("/sessions/{id}", sessionUpdate)
	api.Delete("/sessions/{id}", sessionDelete)
}

type sessionCreateInput struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	LastUpdated json.RawMessage `json:"lastUpdated"`
	Messages    json.RawMessage `json:"messages"`
	Description *string         `json:"description"`
}

func sessionGetAll(w http.ResponseWriter, r *http.Request) {
	list, err := db.ListSessions()
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func sessionGetByID(w http.ResponseWriter, r *http.Request) {
	s, err := db.GetSession(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的会话")
		return
	}
	response.Success(w, s, "")
}

func sessionCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[sessionCreateInput](w, r)
	if !ok {
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	title := in.Title
	if title == "" {
		title = "新的会话"
	}
	msgs := in.Messages
	if len(msgs) == 0 {
		msgs = json.RawMessage("[]")
	}
	s := &db.Session{
		ID:          id,
		Title:       title,
		LastUpdated: db.RawToString(in.LastUpdated),
		Messages:    msgs,
		Description: in.Description,
	}
	if _, err := db.CreateSession(s); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, s, "会话创建成功")
}

func sessionUpdate(w http.ResponseWriter, r *http.Request) {
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	updates := map[string]any{}
	if raw, has := body["title"]; has {
		updates["title"] = db.RawToString(raw)
	}
	if raw, has := body["lastUpdated"]; has {
		updates["lastUpdated"] = db.RawToString(raw)
	}
	if raw, has := body["messages"]; has && len(raw) > 0 {
		updates["messages"] = string(raw)
	}
	if raw, has := body["description"]; has {
		if v := db.RawToNullableString(raw); v != nil {
			updates["description"] = *v
		}
	}
	s, err := db.UpdateSession(entPath(r, "id"), updates)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的会话")
		return
	}
	response.Success(w, s, "会话更新成功")
}

func sessionDelete(w http.ResponseWriter, r *http.Request) {
	ok, err := db.DeleteSession(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的会话")
		return
	}
	response.Success(w, nil, "会话删除成功")
}
