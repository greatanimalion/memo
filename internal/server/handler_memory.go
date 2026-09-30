package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"memo/internal/config"
	"memo/internal/db"
	"memo/internal/jsonx"
	"memo/internal/response"
)

func registerMemoryRoutes(api chi.Router) {
	api.Get("/memorys", memoryGetAll)
	api.Get("/memorys/get_children/{id}", memoryGetChildren)
	api.Get("/memorys_recent", memoryGetRecent)
	api.Get("/memorys_starred", memoryGetStarred)
	api.Post("/memorys", memoryCreate)
	api.Get("/memorys/{id}", memoryGetByID)
	api.Put("/memorys/{id}", memoryUpdate)
	api.Delete("/memorys/{id}", memoryDelete)
	api.Post("/memory/star/{id}", memoryToggleStar)
}

type memoryCreateInput struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	IsFolder    jsonx.Flag `json:"isFolder"`
	FileURL     *string    `json:"fileUrl"`
	ParentID    *string    `json:"parentId"`
	Created     int64      `json:"created"`
	Updated     int64      `json:"updated"`
	VisitedTime *int64     `json:"visitedTime"`
	Size        *int64     `json:"size"`
	Starred     jsonx.Flag `json:"starred"`
}

type memoryUpdateInput struct {
	Title    *string `json:"title"`
	FileURL  *string `json:"fileUrl"`
	ParentID *string `json:"parentId"`
	Content  *string `json:"content"`
}

func memoryGetAll(w http.ResponseWriter, r *http.Request) {
	list, err := db.ListMemories()
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func memoryGetByID(w http.ResponseWriter, r *http.Request) {
	m, err := db.GetMemory(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if m == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的记忆")
		return
	}
	if !m.IsFolder.Bool() {
		_, _ = db.UpdateMemory(m.ID, map[string]any{"visitedTime": time.Now().UnixMilli()})
	}
	response.Success(w, m, "")
}

func memoryGetChildren(w http.ResponseWriter, r *http.Request) {
	list, err := db.GetMemoryChildren(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func memoryGetRecent(w http.ResponseWriter, r *http.Request) {
	list, err := db.ListMemories()
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	threshold := time.Now().UnixMilli() - 5*24*60*60*1000
	recent := []db.Memory{}
	for _, m := range list {
		if m.IsFolder.Bool() || m.VisitedTime == nil {
			continue
		}
		if *m.VisitedTime >= threshold {
			recent = append(recent, m)
		}
	}
	sort.SliceStable(recent, func(i, j int) bool {
		return *recent[i].VisitedTime > *recent[j].VisitedTime
	})
	response.Success(w, recent, "")
}

func memoryGetStarred(w http.ResponseWriter, r *http.Request) {
	list, err := db.GetStarredMemories()
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func memoryCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[memoryCreateInput](w, r)
	if !ok {
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	m := db.Memory{
		ID:          id,
		Title:       in.Title,
		IsFolder:    in.IsFolder,
		FileURL:     in.FileURL,
		ParentID:    in.ParentID,
		Created:     in.Created,
		Updated:     in.Updated,
		VisitedTime: in.VisitedTime,
		Size:        in.Size,
		Starred:     in.Starred,
	}
	if !m.IsFolder.Bool() {
		url, err := createMemoFile("")
		if err != nil {
			response.Fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		m.FileURL = &url
	}
	if err := db.CreateMemory(&m); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, m, "记忆创建成功")
}

func memoryUpdate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[memoryUpdateInput](w, r)
	if !ok {
		return
	}
	now := time.Now().UnixMilli()
	data := map[string]any{"updated": now, "visitedTime": now}
	if in.Title != nil {
		data["title"] = *in.Title
	}
	if in.FileURL != nil {
		data["fileUrl"] = *in.FileURL
	}
	if in.ParentID != nil {
		data["parentId"] = *in.ParentID
	}
	if in.FileURL != nil && in.Content != nil {
		data["size"] = updateMemoFile(*in.FileURL, *in.Content)
	}
	if _, err := db.UpdateMemory(entPath(r, "id"), data); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, data, "记忆更新成功")
}

func memoryDelete(w http.ResponseWriter, r *http.Request) {
	id := entPath(r, "id")
	m, err := db.GetMemory(id)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if m != nil && m.FileURL != nil {
		deleteMemoFile(*m.FileURL)
	}
	ok, err := db.DeleteMemory(id)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的记忆")
		return
	}
	response.Success(w, nil, "记忆删除成功")
}

func memoryToggleStar(w http.ResponseWriter, r *http.Request) {
	id := entPath(r, "id")
	m, err := db.GetMemory(id)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if m == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的记忆")
		return
	}
	wasStarred := 0
	if !m.Starred.Bool() {
		wasStarred = 1
	}
	if _, err := db.UpdateMemory(id, map[string]any{"starred": wasStarred}); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	message := "记忆收藏成功"
	if wasStarred != 0 {
		message = "记忆取消收藏成功"
	}
	response.Success(w, map[string]any{"starred": wasStarred}, message)
}

func createMemoFile(content string) (string, error) {
	now := time.Now()
	dir := filepath.Join(config.FilesDir(),
		strconv.Itoa(now.Year()), fmt.Sprintf("%02d", int(now.Month())), fmt.Sprintf("%02d", now.Day()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	full := filepath.Join(dir, fmt.Sprintf("memo-%d.html", now.UnixMilli()))
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		return "", err
	}
	rel, err := filepath.Rel(config.FilesDir(), full)
	if err != nil {
		return "", err
	}
	return "/uploads/files/" + filepath.ToSlash(rel), nil
}

func memoFilePath(fileURL string) string {
	rel := strings.TrimPrefix(fileURL, "/uploads/files/")
	return filepath.Join(config.FilesDir(), filepath.FromSlash(rel))
}

func deleteMemoFile(fileURL string) {
	_ = os.Remove(memoFilePath(fileURL))
}

func updateMemoFile(fileURL, content string) int64 {
	full := memoFilePath(fileURL)
	if _, err := os.Stat(full); err == nil {
		_ = os.WriteFile(full, []byte(content), 0o644)
	}
	if info, err := os.Stat(full); err == nil {
		return info.Size()
	}
	return 0
}
