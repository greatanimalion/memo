package jsonx

import "encoding/json"

// Flag represents an SQLite 0/1 integer column that may arrive as a JSON
// boolean, number or null.
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
