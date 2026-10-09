package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

// BookAgentState is the shared "blackboard" for a book's agent workflow. It
// carries the structured plan, chapter progress and pending issues across
// agent runs and rounds, mirroring Trae's shared state layer.
type BookAgentState struct {
	BookID    string          `json:"bookId"`
	Plan      string          `json:"plan"`
	Progress  json.RawMessage `json:"progress"`
	Issues    json.RawMessage `json:"issues"`
	UpdatedAt int64           `json:"updatedAt"`
}

const bookAgentStateColumns = "bookId, plan, progress, issues, updatedAt"

func scanBookAgentState(row rowScanner) (*BookAgentState, error) {
	s := &BookAgentState{}
	var plan, progress, issues sql.NullString
	var updated sql.NullInt64
	err := row.Scan(&s.BookID, &plan, &progress, &issues, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.Plan = plan.String
	s.Progress = normalizeJSON(progress.String, "[]")
	s.Issues = normalizeJSON(issues.String, "[]")
	if updated.Valid {
		s.UpdatedAt = updated.Int64
	}
	return s, nil
}

func GetBookAgentState(bookID string) (*BookAgentState, error) {
	return scanBookAgentState(DB().QueryRow(
		"SELECT "+bookAgentStateColumns+" FROM bookAgentState WHERE bookId = ?", bookID))
}

func UpsertBookAgentState(s *BookAgentState) (*BookAgentState, error) {
	progress := s.Progress
	if len(progress) == 0 {
		progress = json.RawMessage("[]")
	}
	issues := s.Issues
	if len(issues) == 0 {
		issues = json.RawMessage("[]")
	}
	now := time.Now().UnixMilli()
	if _, err := DB().Exec(
		"INSERT INTO bookAgentState (bookId, plan, progress, issues, updatedAt) VALUES (?, ?, ?, ?, ?)",
		s.BookID, s.Plan, string(progress), string(issues), now,
	); err != nil {
		return nil, err
	}
	s.Progress = progress
	s.Issues = issues
	s.UpdatedAt = now
	return s, nil
}
