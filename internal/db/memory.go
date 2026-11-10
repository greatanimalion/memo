package db

import (
	"database/sql"

	"memo/internal/jsonx"
)

// Memory 对应 `memorys` 表 / 前端的 `Memory` 类型。
type Memory struct {
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

func scanMemory(rows *sql.Rows) (*Memory, error) {
	m := &Memory{}
	err := rows.Scan(&m.ID, &m.IsFolder, &m.Title, &m.FileURL, &m.ParentID,
		&m.Created, &m.Updated, &m.VisitedTime, &m.Size, &m.Starred)
	if err != nil {
		return nil, err
	}
	return m, nil
}

const memoryColumns = "id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred"

func ListMemories() ([]Memory, error) {
	rows, err := DB().Query("SELECT " + memoryColumns + " FROM memorys")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Memory{}
	for rows.Next() {
		m, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func GetMemory(id string) (*Memory, error) {
	row := DB().QueryRow("SELECT "+memoryColumns+" FROM memorys WHERE id = ?", id)
	m := &Memory{}
	err := row.Scan(&m.ID, &m.IsFolder, &m.Title, &m.FileURL, &m.ParentID,
		&m.Created, &m.Updated, &m.VisitedTime, &m.Size, &m.Starred)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return m, nil
}

func GetMemoryChildren(parentID string) ([]Memory, error) {
	rows, err := DB().Query("SELECT "+memoryColumns+" FROM memorys WHERE parentId = ?", parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Memory{}
	for rows.Next() {
		m, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func GetStarredMemories() ([]Memory, error) {
	rows, err := DB().Query("SELECT " + memoryColumns + " FROM memorys WHERE starred = 1")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Memory{}
	for rows.Next() {
		m, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func CreateMemory(m *Memory) error {
	_, err := DB().Exec(
		"INSERT INTO memorys ("+memoryColumns+") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		m.ID, int(m.IsFolder), m.Title, m.FileURL, m.ParentID,
		m.Created, m.Updated, m.VisitedTime, m.Size, int(m.Starred),
	)
	return err
}

// UpdateMemory 执行部分更新；若 map 为 nil/空则返回 false，
// 使调用方能够延续此前"无内容可更新"的行为。
func UpdateMemory(id string, updates map[string]any) (bool, error) {
	fields, args := buildUpdate(updates, "id")
	if len(fields) == 0 {
		return false, nil
	}
	args = append(args, id)
	res, err := DB().Exec("UPDATE memorys SET "+joinFields(fields)+" WHERE id = ?", args...)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func DeleteMemory(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM memorys WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
