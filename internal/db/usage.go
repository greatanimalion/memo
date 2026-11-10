package db

import (
	"database/sql"
	"time"
)

// UsageStat 对应 `usage_stats` 表：每个自然日一行，记录用户输入时长
// （在编辑器中）以及应用处于前台的时长，均以毫秒为单位。
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

// GetUsage 返回某一天的记录；若该天尚无数据则返回 (nil, nil)。
func GetUsage(date string) (*UsageStat, error) {
	return scanUsage(DB().QueryRow("SELECT "+usageColumns+" FROM usage_stats WHERE date = ?", date))
}

// UpsertUsage 存储某一天的绝对计数值。客户端发送其自行累计的总数，
// 因此直接覆盖可保证写入幂等，避免增量式 API 的读-改-写竞争。
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

// ListUsage 返回 [from, to]（含端点）内的所有行，按日期从旧到新排列。
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
