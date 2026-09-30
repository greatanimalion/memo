package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"memo/internal/db"
	"memo/internal/response"
)

func registerDiaryRoutes(api chi.Router) {
	api.Get("/diarys/{id}", diaryGetByID)
	api.Put("/diarys/{id}", diaryUpdate)
}

func diaryGetByID(w http.ResponseWriter, r *http.Request) {
	d, err := db.GetDiary(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if d == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的日记")
		return
	}
	response.Success(w, d, "")
}

func diaryUpdate(w http.ResponseWriter, r *http.Request) {
	id := entPath(r, "id")
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	existing, err := db.GetDiary(id)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	raw, has := body["monthDiarys"]
	if !has {
		if existing != nil {
			response.Success(w, existing, "日记更新成功")
			return
		}
		raw = json.RawMessage("{}")
	}
	month := map[string]json.RawMessage{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &month); err != nil {
			response.Fail(w, http.StatusBadRequest, "Invalid request body")
			return
		}
	}
	d, err := db.UpdateDiary(id, month)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing == nil {
		response.Success(w, d, "日记创建成功")
		return
	}
	response.Success(w, d, "日记更新成功")
}
