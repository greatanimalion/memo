package agent

import (
	"bytes"
	"encoding/json"
	"strings"
)

const (
	cancelEventText = "请求已取消"
	doneEventText   = "[DONE]"
)

// Emitter 是处理器使用的 SSE 输出接口（由 *response.SSE 实现）。
type Emitter interface {
	Write(event, data string)
}

type toolCallEvent struct {
	Name string `json:"name"`
}

type toolResultEvent struct {
	Name   string `json:"name"`
	Result string `json:"result"`
}

// jsonPayload 完全按照 JSON.stringify 的方式渲染载荷：不做 HTML 转义、
// 无末尾换行、保持结构体字段顺序。
func jsonPayload(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return strings.TrimRight(buf.String(), "\n")
}
