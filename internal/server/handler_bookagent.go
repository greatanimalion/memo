package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/db"
	"memo/internal/response"
)

func registerBookAgentEntityRoutes(api chi.Router) {
	api.Get("/books/{bookId}/agents", bookAgentGetByBookID)
	api.Get("/book-agents/{id}", bookAgentGetByID)
	api.Post("/book-agents", bookAgentCreate)
	api.Put("/book-agents/{id}", bookAgentUpdate)
	api.Delete("/book-agents/{id}", bookAgentDelete)
	api.Delete("/books/{bookId}/agents", bookAgentDeleteByBookID)
}

type bookAgentInput struct {
	ID       string          `json:"id"`
	BookID   string          `json:"bookId"`
	Title    string          `json:"title"`
	Messages json.RawMessage `json:"messages"`
	Status   string          `json:"status"`
}

func bookAgentGetByBookID(w http.ResponseWriter, r *http.Request) {
	bookID := entPath(r, "bookId")
	if bookID == "" {
		response.Fail(w, http.StatusBadRequest, "缺少 bookId 参数")
		return
	}
	list, err := db.GetBookAgentsByBookID(bookID)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func bookAgentGetByID(w http.ResponseWriter, r *http.Request) {
	a, err := db.GetBookAgent(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if a == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的对话记录")
		return
	}
	response.Success(w, a, "")
}

func bookAgentCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[bookAgentInput](w, r)
	if !ok {
		return
	}
	if in.BookID == "" {
		response.Fail(w, http.StatusBadRequest, "缺少 bookId")
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	a := &db.BookAgent{ID: id, BookID: in.BookID, Title: in.Title, Messages: in.Messages, Status: in.Status}
	if _, err := db.CreateBookAgent(a); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, a, "对话记录创建成功")
}

func bookAgentUpdate(w http.ResponseWriter, r *http.Request) {
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	updates := map[string]any{}
	if raw, has := body["title"]; has {
		updates["title"] = db.RawToString(raw)
	}
	if raw, has := body["status"]; has {
		updates["status"] = db.RawToString(raw)
	}
	if raw, has := body["messages"]; has && len(raw) > 0 {
		updates["messages"] = string(raw)
	}
	a, err := db.UpdateBookAgent(entPath(r, "id"), updates)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if a == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的对话记录")
		return
	}
	response.Success(w, a, "对话记录更新成功")
}

func bookAgentDelete(w http.ResponseWriter, r *http.Request) {
	ok, err := db.DeleteBookAgent(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的对话记录")
		return
	}
	response.Success(w, nil, "对话记录删除成功")
}

func bookAgentDeleteByBookID(w http.ResponseWriter, r *http.Request) {
	bookID := entPath(r, "bookId")
	if bookID == "" {
		response.Fail(w, http.StatusBadRequest, "缺少 bookId 参数")
		return
	}
	if _, err := db.DeleteBookAgentsByBookID(bookID); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, nil, "已删除该书籍的所有对话记录")
}
