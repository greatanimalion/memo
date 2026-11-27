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
	// Agent 标识发起本次工具调用的角色（多 Agent 写书流程会带上）
	Agent  string `json:"agent,omitempty"`
	Name   string `json:"name"`
	Result string `json:"result"`
}

// userMessageEvent 是 user_message 事件的载荷：除回显用户输入外，
// 额外携带本次对话在 bookAgent 表中的记录 id，前端据此把实时对话段
// 与持久化记录关联（删除某段对话时需要定位后端记录）。
type userMessageEvent struct {
	Agent     string `json:"agent"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	RecordID  string `json:"recordId"`
}

// chapterSavedEvent 表示一次章节写库成功，前端据此立即刷新章节列表。
type chapterSavedEvent struct {
	Agent     string `json:"agent,omitempty"`
	ChapterID string `json:"chapterId"`
	Title     string `json:"title"`
	Order     int64  `json:"order"`
	// Created 为 true 表示新建章节，false 表示更新既有章节
	Created bool `json:"created"`
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
