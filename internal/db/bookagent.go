package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

// BookAgent mirrors the `bookAgent` table. messages is TEXT JSON that is always
// serialised back as a JSON array.
type BookAgent struct {
	ID        string          `json:"id"`
	BookID    string          `json:"bookId"`
	Title     string          `json:"title"`
	Messages  json.RawMessage `json:"messages"`
	Status    string          `json:"status"`
	CreatedAt int64           `json:"createdAt"`
	UpdatedAt int64           `json:"updatedAt"`
}

const bookAgentColumns = "id, bookId, title, messages, status, createdAt, updatedAt"

func scanBookAgent(row rowScanner) (*BookAgent, error) {
	a := &BookAgent{}
	var msgs sql.NullString
	var created, updated sql.NullInt64
	err := row.Scan(&a.ID, &a.BookID, &a.Title, &msgs, &a.Status, &created, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	a.Messages = normalizeJSON(msgs.String, "[]")
	if created.Valid {
		a.CreatedAt = created.Int64
	}
	if updated.Valid {
		a.UpdatedAt = updated.Int64
	}
	return a, nil
}

func GetBookAgentsByBookID(bookID string) ([]BookAgent, error) {
	rows, err := DB().Query("SELECT "+bookAgentColumns+" FROM bookAgent WHERE bookId = ? ORDER BY createdAt DESC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BookAgent{}
	for rows.Next() {
		a, err := scanBookAgent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

func GetBookAgent(id string) (*BookAgent, error) {
	return scanBookAgent(DB().QueryRow("SELECT "+bookAgentColumns+" FROM bookAgent WHERE id = ?", id))
}

// GetFirstBookAgentByBookID returns the oldest conversation record for a book.
// One bookId maps to exactly one conversation context.
func GetFirstBookAgentByBookID(bookID string) (*BookAgent, error) {
	return scanBookAgent(DB().QueryRow(
		"SELECT "+bookAgentColumns+" FROM bookAgent WHERE bookId = ? ORDER BY createdAt ASC LIMIT 1", bookID))
}

func CreateBookAgent(a *BookAgent) (*BookAgent, error) {
	now := time.Now().UnixMilli()
	msgs := a.Messages
	if len(msgs) == 0 {
		msgs = json.RawMessage("[]")
	}
	status := a.Status
	if status == "" {
		status = "running"
	}
	if _, err := DB().Exec(
		"INSERT INTO bookAgent (id, bookId, title, messages, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
		a.ID, a.BookID, a.Title, string(msgs), status, now, now,
	); err != nil {
		return nil, err
	}
	a.Messages = msgs
	a.Status = status
	a.CreatedAt = now
	a.UpdatedAt = now
	return a, nil
}

func UpdateBookAgent(id string, updates map[string]any) (*BookAgent, error) {
	updates["updatedAt"] = time.Now().UnixMilli()
	setClause, args := buildQuotedUpdate(updates, "id")
	if setClause == "" {
		return nil, nil
	}
	args = append(args, id)
	if _, err := DB().Exec("UPDATE bookAgent SET "+setClause+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return GetBookAgent(id)
}

func DeleteBookAgent(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM bookAgent WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func DeleteBookAgentsByBookID(bookID string) (bool, error) {
	res, err := DB().Exec("DELETE FROM bookAgent WHERE bookId = ?", bookID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
