package server

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"

	"memo/internal/db"
	"memo/internal/response"
)

func registerBookRoutes(api chi.Router) {
	api.Get("/books", bookGetAll)
	api.Get("/books/{id}/detail", bookGetDetail)
	api.Get("/books/{id}", bookGetByID)
	api.Post("/books", bookCreate)
	api.Put("/books/{id}", bookUpdate)
	api.Delete("/books/{id}", bookDelete)

	api.Post("/book/search", bookSearch)

	api.Get("/books/{bookId}/chapters", chapterGetByBookID)
	api.Get("/chapters/{id}", chapterGetByID)
	api.Post("/chapters", chapterCreate)
	api.Put("/chapters/{id}", chapterUpdate)
	api.Delete("/chapters/{id}", chapterDelete)

	api.Get("/books/{bookId}/volumes", volumeGetByBookID)
	api.Get("/volumes/{id}", volumeGetByID)
	api.Post("/volumes", volumeCreate)
	api.Put("/volumes/{id}", volumeUpdate)
	api.Delete("/volumes/{id}", volumeDelete)
}

type bookInput struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Cover       string          `json:"cover"`
	Tags        json.RawMessage `json:"tags"`
	Settings    json.RawMessage `json:"settings"`
	Description string          `json:"description"`
}

func bookGetAll(w http.ResponseWriter, r *http.Request) {
	list, err := db.ListBooks()
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func bookGetByID(w http.ResponseWriter, r *http.Request) {
	b, err := db.GetBook(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if b == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的书籍")
		return
	}
	response.Success(w, b, "")
}

func bookGetDetail(w http.ResponseWriter, r *http.Request) {
	detail, err := buildBookDetail(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if detail == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的书籍")
		return
	}
	response.Success(w, detail, "")
}

func bookCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[bookInput](w, r)
	if !ok {
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	b := &db.Book{
		ID:          id,
		Title:       in.Title,
		Cover:       in.Cover,
		Tags:        in.Tags,
		Settings:    in.Settings,
		Description: in.Description,
	}
	if _, err := db.CreateBook(b); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := db.CreateChapter(&db.Chapter{
		ID:       db.NewID(),
		BookID:   b.ID,
		Title:    "无标题",
		Content:  "",
		Order:    1,
		Metadata: json.RawMessage("{}"),
	}); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	detail, err := buildBookDetail(b.ID)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, detail, "书籍创建成功")
}

func bookUpdate(w http.ResponseWriter, r *http.Request) {
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	updates := map[string]any{}
	for _, key := range []string{"title", "cover", "description"} {
		if raw, has := body[key]; has {
			updates[key] = db.RawToString(raw)
		}
	}
	for _, key := range []string{"tags", "settings"} {
		if raw, has := body[key]; has && len(raw) > 0 {
			updates[key] = string(raw)
		}
	}
	b, err := db.UpdateBook(entPath(r, "id"), updates)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if b == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的书籍")
		return
	}
	response.Success(w, b, "书籍更新成功")
}

func bookDelete(w http.ResponseWriter, r *http.Request) {
	id := entPath(r, "id")
	if err := db.DeleteChaptersByBookID(id); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := db.DeleteVolumesByBookID(id); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	ok, err := db.DeleteBook(id)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的书籍")
		return
	}
	response.Success(w, nil, "书籍删除成功")
}

func buildBookDetail(id string) (*db.BookDetail, error) {
	b, err := db.GetBook(id)
	if err != nil || b == nil {
		return nil, err
	}
	chapters, err := db.GetChapterMetaByBookID(id)
	if err != nil {
		return nil, err
	}
	volumes, err := db.GetVolumesByBookID(id)
	if err != nil {
		return nil, err
	}
	return &db.BookDetail{Book: *b, Chapters: chapters, Volumes: volumes}, nil
}

type chapterInput struct {
	ID        string          `json:"id"`
	BookID    string          `json:"bookId"`
	Title     string          `json:"title"`
	Content   string          `json:"content"`
	WordCount *int64          `json:"wordCount"`
	VolumeID  *string         `json:"volumeId"`
	Order     *int64          `json:"order"`
	CreatedAt *int64          `json:"createdAt"`
	UpdatedAt *int64          `json:"updatedAt"`
	Metadata  json.RawMessage `json:"metadata"`
}

func chapterGetByBookID(w http.ResponseWriter, r *http.Request) {
	list, err := db.GetChaptersByBookID(entPath(r, "bookId"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func chapterGetByID(w http.ResponseWriter, r *http.Request) {
	c, err := db.GetChapter(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if c == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的章节")
		return
	}
	response.Success(w, c, "")
}

func chapterCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[chapterInput](w, r)
	if !ok {
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	order := int64(0)
	if in.Order != nil {
		order = *in.Order
	} else {
		max, err := db.GetMaxChapterOrder(in.BookID)
		if err != nil {
			response.Fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		order = max + 1
	}
	wordCount := int64(0)
	if in.WordCount != nil {
		wordCount = *in.WordCount
	}
	c := &db.Chapter{
		ID:        id,
		BookID:    in.BookID,
		Title:     in.Title,
		Content:   in.Content,
		WordCount: wordCount,
		VolumeID:  in.VolumeID,
		Order:     order,
		Metadata:  in.Metadata,
	}
	if in.CreatedAt != nil {
		c.CreatedAt = *in.CreatedAt
	}
	if in.UpdatedAt != nil {
		c.UpdatedAt = *in.UpdatedAt
	}
	if _, err := db.CreateChapter(c); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, c, "章节创建成功")
}

func chapterUpdate(w http.ResponseWriter, r *http.Request) {
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	updates := map[string]any{}
	if raw, has := body["title"]; has {
		updates["title"] = db.RawToString(raw)
	}
	if raw, has := body["content"]; has {
		updates["content"] = db.RawToString(raw)
	}
	if raw, has := body["wordCount"]; has {
		if n, ok := db.RawToInt64(raw); ok {
			updates["wordCount"] = n
		}
	}
	if raw, has := body["order"]; has {
		if n, ok := db.RawToInt64(raw); ok {
			updates["order"] = n
		}
	}
	if raw, has := body["volumeId"]; has {
		updates["volumeId"] = db.RawToNullableString(raw)
	}
	if raw, has := body["metadata"]; has && len(raw) > 0 {
		updates["metadata"] = string(raw)
	}
	c, err := db.UpdateChapter(entPath(r, "id"), updates)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if c == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的章节")
		return
	}
	response.Success(w, c, "章节更新成功")
}

func chapterDelete(w http.ResponseWriter, r *http.Request) {
	ok, err := db.DeleteChapter(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的章节")
		return
	}
	response.Success(w, nil, "章节删除成功")
}

type volumeInput struct {
	ID        string `json:"id"`
	BookID    string `json:"bookId"`
	Title     string `json:"title"`
	Order     *int64 `json:"order"`
	CreatedAt *int64 `json:"createdAt"`
}

func volumeGetByBookID(w http.ResponseWriter, r *http.Request) {
	list, err := db.GetVolumesByBookID(entPath(r, "bookId"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}

func volumeGetByID(w http.ResponseWriter, r *http.Request) {
	v, err := db.GetVolume(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的卷")
		return
	}
	response.Success(w, v, "")
}

func volumeCreate(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[volumeInput](w, r)
	if !ok {
		return
	}
	id := in.ID
	if id == "" {
		id = db.NewID()
	}
	order := int64(0)
	if in.Order != nil {
		order = *in.Order
	} else {
		max, err := db.GetMaxVolumeOrder(in.BookID)
		if err != nil {
			response.Fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		order = max + 1
	}
	v := &db.Volume{ID: id, BookID: in.BookID, Title: in.Title, Order: order}
	if in.CreatedAt != nil {
		v.CreatedAt = *in.CreatedAt
	}
	if _, err := db.CreateVolume(v); err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Created(w, v, "卷创建成功")
}

func volumeUpdate(w http.ResponseWriter, r *http.Request) {
	body, ok := entDecode[map[string]json.RawMessage](w, r)
	if !ok {
		return
	}
	updates := map[string]any{}
	if raw, has := body["title"]; has {
		updates["title"] = db.RawToString(raw)
	}
	if raw, has := body["order"]; has {
		if n, ok := db.RawToInt64(raw); ok {
			updates["order"] = n
		}
	}
	v, err := db.UpdateVolume(entPath(r, "id"), updates)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		response.Fail(w, http.StatusNotFound, "未找到指定的卷")
		return
	}
	response.Success(w, v, "卷更新成功")
}

func volumeDelete(w http.ResponseWriter, r *http.Request) {
	ok, err := db.DeleteVolume(entPath(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		response.Fail(w, http.StatusNotFound, "未找到指定的卷")
		return
	}
	response.Success(w, nil, "卷删除成功")
}

type searchMatch struct {
	VolumeID     *string `json:"volumeId,omitempty"`
	ChapterID    string  `json:"chapterId"`
	ChapterTitle string  `json:"chapterTitle"`
	Keyword      string  `json:"keyword"`
	Context      string  `json:"context"`
	Position     int     `json:"position"`
}

type searchInput struct {
	BookID  string `json:"bookId"`
	Keyword string `json:"keyword"`
}

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func stripHTML(html string) string {
	s := htmlTagRe.ReplaceAllString(html, "")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&#39;", "'")
	return s
}

func indexRunes(haystack, needle []rune, from int) int {
	if len(needle) == 0 || from > len(haystack) {
		return -1
	}
	for i := from; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func lowerRunes(s string) []rune {
	r := []rune(s)
	for i := range r {
		r[i] = unicode.ToLower(r[i])
	}
	return r
}

func bookSearch(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[searchInput](w, r)
	if !ok {
		return
	}
	if in.BookID == "" || in.Keyword == "" {
		response.Fail(w, http.StatusBadRequest, "bookId 和 keyword 为必填项")
		return
	}
	chapters, err := db.GetChaptersByBookID(in.BookID)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	volumes, err := db.GetVolumesByBookID(in.BookID)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	volumeIDs := map[string]bool{}
	for _, v := range volumes {
		volumeIDs[v.ID] = true
	}
	keywordRunes := []rune(in.Keyword)
	lowerKeyword := lowerRunes(in.Keyword)
	contextLength := 5
	results := []searchMatch{}
	for _, chapter := range chapters {
		text := []rune(stripHTML(chapter.Content))
		if len(text) == 0 {
			continue
		}
		lowerText := lowerRunes(string(text))
		for index := indexRunes(lowerText, lowerKeyword, 0); index != -1; index = indexRunes(lowerText, lowerKeyword, index+len(keywordRunes)) {
			start := index - contextLength
			if start < 0 {
				start = 0
			}
			end := index + len(keywordRunes) + contextLength
			if end > len(text) {
				end = len(text)
			}
			match := searchMatch{
				ChapterID:    chapter.ID,
				ChapterTitle: chapter.Title,
				Keyword:      in.Keyword,
				Context:      string(text[start:end]),
				Position:     index + 1,
			}
			if chapter.VolumeID != nil && volumeIDs[*chapter.VolumeID] {
				match.VolumeID = chapter.VolumeID
			}
			results = append(results, match)
		}
	}
	response.Success(w, results, "")
}
