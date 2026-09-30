package db

import (
	"database/sql"
	"time"
)

// UsageStat mirrors the `usage_stats` table: one row per calendar day holding
// how long the user was typing (in the editors) and how long the app was in
// the foreground, both in milliseconds.
type UsageStat struct {
	Date      string `json:"date"`
	TypingMs  int64  `json:"typingMs"`
	ActiveMs  int64  `json:"activeMs"`
	UpdatedAt int64  `json:"updatedAt"`
}

const usageColumns = "date, typingMs, activeMs, updatedAt"

func scanUsage(row *sql.Row) (*UsageStat, error) {
	var u UsageStat
	if err := row.Scan(&u.Date, &u.TypingMs, &u.ActiveMs, &u.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// GetUsage returns the row for a single day, or (nil, nil) when the day has
// no data yet.
func GetUsage(date string) (*UsageStat, error) {
	return scanUsage(DB().QueryRow("SELECT "+usageColumns+" FROM usage_stats WHERE date = ?", date))
}

// UpsertUsage stores the absolute counters for a day. The client sends the
// totals it has accumulated itself, so overwriting keeps the write idempotent
// and avoids the read-modify-write race of an incrementing API.
func UpsertUsage(date string, typingMs, activeMs int64) (*UsageStat, error) {
	now := time.Now().UnixMilli()
	const stmt = `INSERT INTO usage_stats (date, typingMs, activeMs, updatedAt)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(date) DO UPDATE SET
			typingMs = excluded.typingMs,
			activeMs = excluded.activeMs,
			updatedAt = excluded.updatedAt`
	if _, err := DB().Exec(stmt, date, typingMs, activeMs, now); err != nil {
		return nil, err
	}
	return &UsageStat{Date: date, TypingMs: typingMs, ActiveMs: activeMs, UpdatedAt: now}, nil
}

// ListUsage returns every row in [from, to] (inclusive), oldest first.
func ListUsage(from, to string) ([]UsageStat, error) {
	rows, err := DB().Query(
		"SELECT "+usageColumns+" FROM usage_stats WHERE date >= ? AND date <= ? ORDER BY date ASC",
		from, to,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []UsageStat{}
	for rows.Next() {
		var u UsageStat
		if err := rows.Scan(&u.Date, &u.TypingMs, &u.ActiveMs, &u.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, rows.Err()
}
