package db

import (
	"database/sql"
	"time"
)

// Volume 对应 `volumes` 表。
type Volume struct {
	ID        string `json:"id"`
	BookID    string `json:"bookId"`
	Title     string `json:"title"`
	Order     int64  `json:"order"`
	CreatedAt int64  `json:"createdAt"`
}

const volumeColumns = "id, bookId, title, `order`, createdAt"

func scanVolume(row rowScanner) (*Volume, error) {
	v := &Volume{}
	var created sql.NullInt64
	err := row.Scan(&v.ID, &v.BookID, &v.Title, &v.Order, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if created.Valid {
		v.CreatedAt = created.Int64
	}
	return v, nil
}

func GetVolumesByBookID(bookID string) ([]Volume, error) {
	rows, err := DB().Query("SELECT "+volumeColumns+" FROM volumes WHERE bookId = ? ORDER BY `order` ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Volume{}
	for rows.Next() {
		v, err := scanVolume(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

func GetVolume(id string) (*Volume, error) {
	return scanVolume(DB().QueryRow("SELECT "+volumeColumns+" FROM volumes WHERE id = ?", id))
}

func CreateVolume(v *Volume) (*Volume, error) {
	now := time.Now().UnixMilli()
	created := v.CreatedAt
	if created == 0 {
		created = now
	}
	if _, err := DB().Exec(
		"INSERT INTO volumes (id, bookId, title, `order`, createdAt) VALUES (?, ?, ?, ?, ?)",
		v.ID, v.BookID, v.Title, v.Order, created,
	); err != nil {
		return nil, err
	}
	v.CreatedAt = now
	return v, nil
}

func UpdateVolume(id string, updates map[string]any) (*Volume, error) {
	setClause, args := buildQuotedUpdate(updates, "id")
	if setClause == "" {
		return nil, nil
	}
	args = append(args, id)
	if _, err := DB().Exec("UPDATE volumes SET "+setClause+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return GetVolume(id)
}

func DeleteVolume(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM volumes WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func DeleteVolumesByBookID(bookID string) error {
	_, err := DB().Exec("DELETE FROM volumes WHERE bookId = ?", bookID)
	return err
}

func GetMaxVolumeOrder(bookID string) (int64, error) {
	var max sql.NullInt64
	if err := DB().QueryRow("SELECT MAX(`order`) FROM volumes WHERE bookId = ?", bookID).Scan(&max); err != nil {
		return 0, err
	}
	if max.Valid {
		return max.Int64, nil
	}
	return 0, nil
}
