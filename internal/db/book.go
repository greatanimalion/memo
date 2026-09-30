package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Book mirrors the `books` table. tags/settings are stored as TEXT JSON and are
// returned as JSON arrays/objects.
type Book struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Cover       string          `json:"cover"`
	Tags        json.RawMessage `json:"tags"`
	Description string          `json:"description"`
	Settings    json.RawMessage `json:"settings"`
	CreatedAt   int64           `json:"createdAt"`
	UpdatedAt   int64           `json:"updatedAt"`
}

// BookDetail is the shape returned by GET /books/:id/detail.
type BookDetail struct {
	Book
	Chapters []ChapterMeta `json:"chapters"`
	Volumes  []Volume      `json:"volumes"`
}

const bookColumns = "id, title, cover, tags, settings, description, createdAt, updatedAt"

func scanBook(row rowScanner) (*Book, error) {
	b := &Book{}
	var tags, settings, desc sql.NullString
	var created, updated sql.NullInt64
	err := row.Scan(&b.ID, &b.Title, &b.Cover, &tags, &settings, &desc, &created, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	b.Tags = normalizeJSON(tags.String, "[]")
	b.Settings = normalizeJSON(settings.String, "{}")
	if desc.Valid {
		b.Description = desc.String
	}
	if created.Valid {
		b.CreatedAt = created.Int64
	}
	if updated.Valid {
		b.UpdatedAt = updated.Int64
	}
	return b, nil
}

func ListBooks() ([]Book, error) {
	rows, err := DB().Query("SELECT " + bookColumns + " FROM books")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Book{}
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

func GetBook(id string) (*Book, error) {
	return scanBook(DB().QueryRow("SELECT "+bookColumns+" FROM books WHERE id = ?", id))
}

func CreateBook(b *Book) (*Book, error) {
	now := time.Now().UnixMilli()
	if len(b.Tags) == 0 {
		b.Tags = json.RawMessage("[]")
	}
	if len(b.Settings) == 0 {
		b.Settings = json.RawMessage("{}")
	}
	if _, err := DB().Exec(
		"INSERT INTO books (id, title, cover, tags, settings, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		b.ID, b.Title, b.Cover, string(b.Tags), string(b.Settings), b.Description, now, now,
	); err != nil {
		return nil, err
	}
	b.CreatedAt = now
	b.UpdatedAt = now
	return b, nil
}

func UpdateBook(id string, updates map[string]any) (*Book, error) {
	updates["updatedAt"] = time.Now().UnixMilli()
	fields, args := buildUpdate(updates, "id")
	if len(fields) == 0 {
		return nil, nil
	}
	args = append(args, id)
	if _, err := DB().Exec("UPDATE books SET "+joinFields(fields)+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return GetBook(id)
}

func DeleteBook(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM books WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
