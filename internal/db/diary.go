package db

import (
	"database/sql"
	"encoding/json"
)

// Diary 对应 `diarys` 表。monthDiarys 以原始 JSON 形式保存，
// 确保写入时不丢失任何按天的结构。
type Diary struct {
	ID          string                     `json:"id"`
	MonthDiarys map[string]json.RawMessage `json:"monthDiarys"`
}

func scanDiary(row *sql.Row) (*Diary, error) {
	var (
		id       string
		monthRaw string
	)
	if err := row.Scan(&id, &monthRaw); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	d := &Diary{ID: id, MonthDiarys: map[string]json.RawMessage{}}
	if monthRaw != "" {
		if err := json.Unmarshal([]byte(monthRaw), &d.MonthDiarys); err != nil {
			var anyVal any
			if json.Unmarshal([]byte(monthRaw), &anyVal) == nil {
				raw, _ := json.Marshal(anyVal)
				d.MonthDiarys = map[string]json.RawMessage{"_raw": raw}
			}
		}
	}
	return d, nil
}

func GetDiary(id string) (*Diary, error) {
	return scanDiary(DB().QueryRow("SELECT id, monthDiarys FROM diarys WHERE id = ?", id))
}

func CreateDiary(d *Diary) (*Diary, error) {
	raw, err := json.Marshal(d.MonthDiarys)
	if err != nil {
		return nil, err
	}
	if _, err := DB().Exec("INSERT INTO diarys (id, monthDiarys) VALUES (?, ?)", d.ID, string(raw)); err != nil {
		return nil, err
	}
	return d, nil
}

// UpdateDiary 执行 upsert：当 UPDATE 未匹配到任何行时会插入新行
// （与此前实现的行为一致）。
func UpdateDiary(id string, monthDiarys map[string]json.RawMessage) (*Diary, error) {
	raw, err := json.Marshal(monthDiarys)
	if err != nil {
		return nil, err
	}
	res, err := DB().Exec("UPDATE diarys SET monthDiarys = ? WHERE id = ?", string(raw), id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return &Diary{ID: id, MonthDiarys: monthDiarys}, nil
	}
	if _, err := DB().Exec("INSERT INTO diarys (id, monthDiarys) VALUES (?, ?)", id, string(raw)); err != nil {
		return nil, err
	}
	return &Diary{ID: id, MonthDiarys: monthDiarys}, nil
}
