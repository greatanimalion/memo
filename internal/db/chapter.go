package db

import (
	"database/sql"
	"encoding/json"

	// "strings" // isAi 分流后不再使用字符串判空
	"time"
)

// Chapter 对应 `chapters` 表，包含完整正文内容。
type Chapter struct {
	ID        string          `json:"id"`
	BookID    string          `json:"bookId"`
	Title     string          `json:"title"`
	Content   string          `json:"content"`
	AIRes     string          `json:"aiRes"`
	IsAI      int64           `json:"isAi"`
	WordCount int64           `json:"wordCount"`
	VolumeID  *string         `json:"volumeId"`
	Order     int64           `json:"order"`
	CreatedAt int64           `json:"createdAt"`
	UpdatedAt int64           `json:"updatedAt"`
	Metadata  json.RawMessage `json:"metadata"`
}

// ChapterMeta 是 GET /books/:id/detail 使用的不含正文的投影结构。
type ChapterMeta struct {
	ID        string  `json:"id"`
	BookID    string  `json:"bookId"`
	Title     string  `json:"title"`
	IsAI      int64   `json:"isAi"`
	WordCount int64   `json:"wordCount"`
	VolumeID  *string `json:"volumeId"`
	Order     int64   `json:"order"`
	CreatedAt int64   `json:"createdAt"`
	UpdatedAt int64   `json:"updatedAt"`
}

// EffectiveContent 返回供 AI 读取的章节正文：
// isAi=1（AI 写的）读 aiRes，isAi=0（人工写的）读 content。
func (c *Chapter) EffectiveContent() string {
	if c == nil {
		return ""
	}
	if c.IsAI != 0 {
		return c.AIRes
	}
	return c.Content
}

const chapterColumns = "id, bookId, title, content, aiRes, isAi, wordCount, volumeId, `order`, createdAt, updatedAt, metadata"
const chapterMetaColumns = "id, bookId, title, isAi, wordCount, volumeId, `order`, createdAt, updatedAt"

func scanChapter(row rowScanner) (*Chapter, error) {
	c := &Chapter{}
	var vol, meta sql.NullString
	var created, updated sql.NullInt64
	err := row.Scan(&c.ID, &c.BookID, &c.Title, &c.Content, &c.AIRes, &c.IsAI, &c.WordCount, &vol, &c.Order, &created, &updated, &meta)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.Metadata = normalizeJSON(meta.String, "{}")
	if vol.Valid {
		v := vol.String
		c.VolumeID = &v
	}
	if created.Valid {
		c.CreatedAt = created.Int64
	}
	if updated.Valid {
		c.UpdatedAt = updated.Int64
	}
	return c, nil
}

func scanChapterMeta(row rowScanner) (*ChapterMeta, error) {
	c := &ChapterMeta{}
	var vol sql.NullString
	var created, updated sql.NullInt64
	err := row.Scan(&c.ID, &c.BookID, &c.Title, &c.IsAI, &c.WordCount, &vol, &c.Order, &created, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if vol.Valid {
		v := vol.String
		c.VolumeID = &v
	}
	if created.Valid {
		c.CreatedAt = created.Int64
	}
	if updated.Valid {
		c.UpdatedAt = updated.Int64
	}
	return c, nil
}

func GetChaptersByBookID(bookID string) ([]Chapter, error) {
	rows, err := DB().Query("SELECT "+chapterColumns+" FROM chapters WHERE bookId = ? ORDER BY `order` ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Chapter{}
	for rows.Next() {
		c, err := scanChapter(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func GetChapterMetaByBookID(bookID string) ([]ChapterMeta, error) {
	rows, err := DB().Query("SELECT "+chapterMetaColumns+" FROM chapters WHERE bookId = ? ORDER BY `order` ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ChapterMeta{}
	for rows.Next() {
		c, err := scanChapterMeta(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func GetChapter(id string) (*Chapter, error) {
	return scanChapter(DB().QueryRow("SELECT "+chapterColumns+" FROM chapters WHERE id = ?", id))
}

// GetChapterByOrder 按书籍与序号读取单章，避免为取上一章而载入全部正文。
func GetChapterByOrder(bookID string, order int64) (*Chapter, error) {
	return scanChapter(DB().QueryRow(
		"SELECT "+chapterColumns+" FROM chapters WHERE bookId = ? AND `order` = ? LIMIT 1", bookID, order))
}

// GetLastChapterByBookID 读取某本书序号最大的章节（通常是最近写入的一章）。
func GetLastChapterByBookID(bookID string) (*Chapter, error) {
	return scanChapter(DB().QueryRow(
		"SELECT "+chapterColumns+" FROM chapters WHERE bookId = ? ORDER BY `order` DESC LIMIT 1", bookID))
}

func CreateChapter(c *Chapter) (*Chapter, error) {
	now := time.Now().UnixMilli()
	created := c.CreatedAt
	if created == 0 {
		created = now
	}
	updated := c.UpdatedAt
	if updated == 0 {
		updated = now
	}
	meta := c.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	// `order` 未指定（0 或负数）时按本书当前最大序号 +1 自动递增，
	// 调用方无需再自行计算；显式传入的正序号保持不变。
	if c.Order <= 0 {
		max, err := GetMaxChapterOrder(c.BookID)
		if err != nil {
			return nil, err
		}
		c.Order = max + 1
	}
	if _, err := DB().Exec(
		"INSERT INTO chapters (id, bookId, title, content, aiRes, isAi, wordCount, volumeId, `order`, createdAt, updatedAt, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		c.ID, c.BookID, c.Title, c.Content, c.AIRes, c.IsAI, c.WordCount, c.VolumeID, c.Order, created, updated, string(meta),
	); err != nil {
		return nil, err
	}
	c.Metadata = meta
	c.CreatedAt = now
	c.UpdatedAt = now
	return c, nil
}

func UpdateChapter(id string, updates map[string]any) (*Chapter, error) {
	updates["updatedAt"] = time.Now().UnixMilli()
	setClause, args := buildQuotedUpdate(updates, "id")
	if setClause == "" {
		return nil, nil
	}
	args = append(args, id)
	if _, err := DB().Exec("UPDATE chapters SET "+setClause+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return GetChapter(id)
}

func DeleteChapter(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM chapters WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func DeleteChaptersByBookID(bookID string) error {
	_, err := DB().Exec("DELETE FROM chapters WHERE bookId = ?", bookID)
	return err
}

func GetMaxChapterOrder(bookID string) (int64, error) {
	var max sql.NullInt64
	if err := DB().QueryRow("SELECT MAX(`order`) FROM chapters WHERE bookId = ?", bookID).Scan(&max); err != nil {
		return 0, err
	}
	if max.Valid {
		return max.Int64, nil
	}
	return 0, nil
}
