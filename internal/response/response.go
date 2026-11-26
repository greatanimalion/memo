package response

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Success 写入与原 Express 处理程序一致的响应封装：
// {"code":200,"data":...,"message":"success"}
func Success(w http.ResponseWriter, data any, message string) {
	if message == "" {
		message = "success"
	}
	write(w, http.StatusOK, map[string]any{
		"code":    200,
		"data":    data,
		"message": message,
	})
}

// Created 对应 Express 的 201 响应。
func Created(w http.ResponseWriter, data any, message string) {
	if message == "" {
		message = "created"
	}
	write(w, http.StatusCreated, map[string]any{
		"code":    201,
		"data":    data,
		"message": message,
	})
}

// Fail 对应 errorResponse：{"code":status,"error":message}
func Fail(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]any{
		"code":  status,
		"error": message,
	})
}

// Raw 写入纯 JSON 响应体（用于 AI 接口的参数校验错误）。
func Raw(w http.ResponseWriter, status int, body map[string]any) {
	write(w, status, body)
}

func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// SSE 是 Server-Sent Events 写入器，兼容原有的
// `sseWrite(res, event, data)` 辅助函数。
type SSE struct {
	w http.ResponseWriter
	f http.Flusher

	// 心跳协程与业务协程会并发写入，必须加锁避免响应体交错。
	mu     sync.Mutex
	closed bool
}

// StartSSE 将响应切换为 event-stream 模式。
func StartSSE(w http.ResponseWriter) *SSE {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	s := &SSE{w: w}
	if f, ok := w.(http.Flusher); ok {
		s.f = f
	}
	return s
}

// Comment 写入一条 SSE 注释行（如 : connected / : keep-alive）。
// 注释行用于建立连接与保活，前端不会把它当作事件处理。
func (s *SSE) Comment(text string) {
	s.writeRaw(": " + text + "\n\n")
}

// Heartbeat 每隔 interval 写入一条 keep-alive 注释，返回停止函数。
// 用于长时间运行的多 Agent 流程，避免连接被代理层按空闲超时断开。
func (s *SSE) Heartbeat(interval time.Duration) func() {
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				s.Comment("keep-alive")
			}
		}
	}()
	var once sync.Once
	return func() {
		once.Do(func() { close(done) })
	}
}

func (s *SSE) Write(event, data string) {
	// 多行数据必须逐行加 data: 前缀，否则换行后的内容会被 SSE 分帧规则丢弃。
	// 模型流式输出的正文片段通常包含换行，这里统一处理。
	var b strings.Builder
	fmt.Fprintf(&b, "event: %s\n", event)
	for _, line := range strings.Split(data, "\n") {
		fmt.Fprintf(&b, "data: %s\n", line)
	}
	b.WriteString("\n")
	s.writeRaw(b.String())
}

// writeRaw 在锁内写入并立即 flush；关闭后忽略后续写入，
// 避免心跳协程在 handler 返回后继续操作 ResponseWriter。
func (s *SSE) writeRaw(payload string) {
	if s == nil || s.w == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	_, _ = io.WriteString(s.w, payload)
	if s.f != nil {
		s.f.Flush()
	}
}

func (s *SSE) End() {
	if s == nil || s.w == nil {
		return
	}
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()
	if s.f != nil {
		s.f.Flush()
	}
}
