package ai

import (
	"encoding/json"
	"testing"

	"memo/internal/db"
)

func TestWriteDiaryMergesIntoMonthRow(t *testing.T) {
	if _, err := db.DB().Exec("DELETE FROM diarys"); err != nil {
		t.Fatal(err)
	}

	existing := map[string]json.RawMessage{
		"2031-04-01": json.RawMessage(`{"todos":[],"note":"已有内容"}`),
	}
	if _, err := db.UpdateDiary("2031-04", existing); err != nil {
		t.Fatal(err)
	}

	result, err := executeTool("write_diary", `{"date":"2031-04-15","todos":[{"text":"写测试"}],"note":"新备注"}`)
	if err != nil {
		t.Fatal(err)
	}
	if result != "日记记录成功，日期：2031-04-15" {
		t.Fatalf("result = %q", result)
	}

	diary, err := db.GetDiary("2031-04")
	if err != nil || diary == nil {
		t.Fatalf("month diary read failed: %v", err)
	}
	if _, ok := diary.MonthDiarys["2031-04-01"]; !ok {
		t.Fatal("existing day was overwritten")
	}
	if _, ok := diary.MonthDiarys["2031-04-15"]; !ok {
		t.Fatal("new day was not written to the month row")
	}

	// 不应再写到以完整日期为 id 的错误行上。
	legacy, err := db.GetDiary("2031-04-15")
	if err != nil {
		t.Fatal(err)
	}
	if legacy != nil {
		t.Fatal("diary was written to a date id instead of the month id")
	}
}
