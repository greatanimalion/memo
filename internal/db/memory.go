package db

import (
	"database/sql"
	"strings"

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

// SearchMemoriesByTitle 按标题做模糊查询（SQL LIKE，忽略大小写），
// 标题完全匹配的排在前面，其余按更新时间倒序；limit <= 0 时默认 20 条。
func SearchMemoriesByTitle(keyword string, limit int) ([]Memory, error) {
	if limit <= 0 {
		limit = 20
	}
	pattern := "%" + escapeLike(keyword) + "%"
	rows, err := DB().Query(
		"SELECT "+memoryColumns+" FROM memorys WHERE title LIKE ? ESCAPE '\\'"+
			" ORDER BY CASE WHEN title = ? THEN 0 ELSE 1 END, updated DESC LIMIT ?",
		pattern, keyword, limit,
	)
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

// escapeLike 转义 LIKE 通配符，避免用户输入中的 % / _ 被当作模式匹配。
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(s)
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
	// 创建记忆的 id 统一在这里生成，调用方无需传入
	if strings.TrimSpace(m.ID) == "" {
		m.ID = NewID()
	}
	// 创建记忆必须带 parentId：未指定时统一默认挂到根目录 root
	if m.ParentID == nil || strings.TrimSpace(*m.ParentID) == "" {
		root := "root"
		m.ParentID = &root
	}
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
