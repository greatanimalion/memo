package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/db"
	"memo/internal/response"
)

func registerAgentRoutes(api chi.Router) {
	api.Get("/agents", agentGetAll)
	api.Post("/agents", agentCreate)
	api.Put("/agents/{id}", agentUpdate)
	api.Delete("/agents/{id}", agentDelete)
}

type agentInput struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
}

func agentGetAll(w http.ResponseWriter, r *http.Request) {
	list, err := db.ListAgents()
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func agentCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[agentInput](w, r)
	if !ok {
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	a := &db.Agent{ID: id, Name: in.Name, Description: in.Description, Content: in.Content}
	if _, err := db.CreateAgent(a); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, a, "agent创建成功")
}

func agentUpdate(w http.ResponseWriter, r *http.Request) {
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	updates := map[string]any{}
	for key, raw := range body {
		switch key {
		case "name", "description", "content":
			updates[key] = db.RawToString(raw)
		}
	}
	id := entPath(r, "id")
	updated, err := db.UpdateAgent(id, updates)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if updated != nil {
		response.Success(w, updated, "agent更新成功")
		return
	}
	if bodyID := db.RawToString(body["id"]); bodyID != "" {
		id = bodyID
	}
	a := &db.Agent{
		ID:          id,
		Name:        db.RawToString(body["name"]),
		Description: db.RawToString(body["description"]),
		Content:     db.RawToString(body["content"]),
	}
	if _, err := db.CreateAgent(a); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, a, "agent创建成功")
}

func agentDelete(w http.ResponseWriter, r *http.Request) {
	ok, err := db.DeleteAgent(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的agent")
		return
	}
	response.Success(w, nil, "agent删除成功")
}
