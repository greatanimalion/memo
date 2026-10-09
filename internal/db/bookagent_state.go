package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

// BookAgentState 是书籍 Agent 工作流的共享"黑板"。它在多次 Agent 运行与
// 轮次之间承载结构化计划、章节进度和待处理问题，对应 Trae 的共享状态层。
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
		"INSERT INTO bookAgentState (bookId, plan, progress, issues, updatedAt) VALUES (?, ?, ?, ?, ?) "+
			"ON CONFLICT(bookId) DO UPDATE SET plan = excluded.plan, progress = excluded.progress, "+
			"issues = excluded.issues, updatedAt = excluded.updatedAt",
		s.BookID, s.Plan, string(progress), string(issues), now,
	); err != nil {
		return nil, err
	}
	s.Progress = progress
	s.Issues = issues
	s.UpdatedAt = now
	return s, nil
}
