package db

import (
	"database/sql"
	"encoding/json"
)

// Session mirrors the `sessions` table. messages is stored as TEXT JSON but is
// always serialised back as a JSON array.
type Session struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	LastUpdated string          `json:"lastUpdated"`
	Messages    json.RawMessage `json:"messages"`
	Description *string         `json:"description"`
}

const sessionColumns = "id, title, lastUpdated, messages, description"

func scanSession(row rowScanner) (*Session, error) {
	s := &Session{}
	var last, msgs sql.NullString
	var desc sql.NullString
	err := row.Scan(&s.ID, &s.Title, &last, &msgs, &desc)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.LastUpdated = last.String
	s.Messages = normalizeJSON(msgs.String, "[]")
	if desc.Valid {
		v := desc.String
		s.Description = &v
	}
	return s, nil
}

func ListSessions() ([]Session, error) {
	rows, err := DB().Query("SELECT " + sessionColumns + " FROM sessions")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func GetSession(id string) (*Session, error) {
	return scanSession(DB().QueryRow("SELECT "+sessionColumns+" FROM sessions WHERE id = ?", id))
}

func CreateSession(s *Session) (*Session, error) {
	msgs := s.Messages
	if len(msgs) == 0 {
		msgs = json.RawMessage("[]")
	}
	if _, err := DB().Exec(
		"INSERT INTO sessions (id, title, lastUpdated, messages, description) VALUES (?, ?, ?, ?, ?)",
		s.ID, s.Title, s.LastUpdated, string(msgs), s.Description,
	); err != nil {
		return nil, err
	}
	return s, nil
}

func UpdateSession(id string, updates map[string]any) (*Session, error) {
	fields, args := buildUpdate(updates, "id")
	if len(fields) == 0 {
		return nil, nil
	}
	args = append(args, id)
	if _, err := DB().Exec("UPDATE sessions SET "+joinFields(fields)+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return GetSession(id)
}

func DeleteSession(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM sessions WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
