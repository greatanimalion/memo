package jsonx

import "encoding/json"

// Flag 表示 SQLite 的 0/1 整数列，其 JSON 输入可能为
// 布尔值、数字或 null。
type Flag int

func (f *Flag) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*f = 0
		return nil
	}
	var n float64
	if err := json.Unmarshal(data, &n); err == nil {
		if n != 0 {
			*f = 1
		} else {
			*f = 0
		}
		return nil
	}
	var b bool
	if err := json.Unmarshal(data, &b); err == nil {
		if b {
			*f = 1
		} else {
			*f = 0
		}
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		if s != "" && s != "0" {
			*f = 1
		} else {
			*f = 0
		}
		return nil
	}
	*f = 0
	return nil
}

func (f Flag) MarshalJSON() ([]byte, error) {
	return json.Marshal(int(f))
}

func (f Flag) Bool() bool { return f != 0 }
