package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"memo/internal/ai/agent"
)

// 后台聊天任务：与 book-agent 一致，任务生命周期与 HTTP 连接解耦，
// 事件按 Seq 缓冲，前端凭 taskId 增量拉取；整页刷新后也能续上回答。

// ChatTaskSnapshot 是聊天任务状态查询结果，Events 只返回请求区间内的事件。
type ChatTaskSnapshot struct {
	ID        string      `json:"id"`
	SessionID string      `json:"sessionId"`
	Status    string      `json:"status"`
	Events    []TaskEvent `json:"events"`
	NextSeq   int         `json:"nextSeq"`
}

// ChatTask 是一次后台聊天流任务的运行状态与事件缓冲。
type ChatTask struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	mu     sync.Mutex
	events []TaskEvent
	cancel context.CancelFunc
}

// chatTaskEmitter 把 RunChatStream / RunAgent 的 SSE 输出写入任务事件缓冲。
type chatTaskEmitter struct{ task *ChatTask }

func (e chatTaskEmitter) Write(event, data string) { e.task.append(event, data) }

func (t *ChatTask) append(event, data string) {
	t.mu.Lock()
	t.events = append(t.events, TaskEvent{Seq: len(t.events), Type: event, Data: data})
	t.UpdatedAt = time.Now()
	t.mu.Unlock()
}

// finish 根据最后一条终态事件确定任务状态；正常返回且无显式终态时视为 done。
func (t *ChatTask) finish() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.Status != "running" {
		return
	}
	status := "done"
loop:
	for i := len(t.events) - 1; i >= 0; i-- {
		switch t.events[i].Type {
		case "error":
			status = "error"
			break loop
		case "cancel":
			status = "cancelled"
			break loop
		case "done":
			break loop
		}
	}
	t.Status = status
	t.UpdatedAt = time.Now()
}

// ChatTaskManager 管理进行中与刚结束的聊天任务。
type ChatTaskManager struct {
	mu            sync.Mutex
	tasks         map[string]*ChatTask
	lastBySession map[string]string
}

// 任务结束后保留一段时间，便于前端拉取最终状态；超时后回收内存。
const chatTaskTTL = 30 * time.Minute

var defaultChatTaskManager = &ChatTaskManager{
	tasks:         map[string]*ChatTask{},
	lastBySession: map[string]string{},
}

// ChatTasks 返回全局聊天任务管理器。
func ChatTasks() *ChatTaskManager { return defaultChatTaskManager }

// Start 在后台启动聊天任务并立即返回；req.RequestID 为空时自动生成。
func (m *ChatTaskManager) Start(
	sessionID string,
	requestID string,
	agentMode bool,
	req agent.ChatRequest,
) *ChatTask {
	id := strings.TrimSpace(requestID)
	if id == "" {
		id = newChatTaskID()
	}
	req.RequestID = id

	ctx, cancel := context.WithCancel(context.Background())
	task := &ChatTask{
		ID:        id,
		SessionID: sessionID,
		Status:    "running",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		cancel:    cancel,
	}

	m.mu.Lock()
	if old, ok := m.tasks[id]; ok {
		// 重复的 requestId：先终止旧任务，避免同一任务并发执行
		old.cancel()
	}
	m.tasks[id] = task
	if sessionID != "" {
		m.lastBySession[sessionID] = id
	}
	m.mu.Unlock()

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				task.append("error", fmt.Sprintf("聊天任务异常终止: %v", rec))
			}
			task.finish()
			cancel()
			m.scheduleCleanup(id)
		}()
		if agentMode {
			agent.RunAgent(ctx, req, chatTaskEmitter{task})
			return
		}
		agent.RunChatStream(ctx, req, chatTaskEmitter{task})
	}()

	return task
}

// Snapshot 返回任务状态与 [from, from+limit) 区间内的事件。
func (m *ChatTaskManager) Snapshot(id string, from, limit int) (ChatTaskSnapshot, bool) {
	m.mu.Lock()
	task := m.tasks[id]
	m.mu.Unlock()
	if task == nil {
		return ChatTaskSnapshot{}, false
	}

	task.mu.Lock()
	defer task.mu.Unlock()

	if from < 0 {
		from = 0
	}
	if from > len(task.events) {
		from = len(task.events)
	}
	if limit <= 0 {
		limit = 500
	}
	end := from + limit
	if end > len(task.events) {
		end = len(task.events)
	}
	events := make([]TaskEvent, end-from)
	copy(events, task.events[from:end])

	return ChatTaskSnapshot{
		ID:        task.ID,
		SessionID: task.SessionID,
		Status:    task.Status,
		Events:    events,
		NextSeq:   end,
	}, true
}

// Cancel 取消进行中的任务；任务不存在返回 false。
func (m *ChatTaskManager) Cancel(id string) bool {
	m.mu.Lock()
	task := m.tasks[id]
	m.mu.Unlock()
	if task == nil {
		return false
	}
	task.cancel()
	return true
}

// ActiveBySession 返回该会话当前进行中的任务 id。
func (m *ChatTaskManager) ActiveBySession(sessionID string) (string, bool) {
	m.mu.Lock()
	id, ok := m.lastBySession[sessionID]
	task := m.tasks[id]
	m.mu.Unlock()
	if !ok || task == nil {
		return "", false
	}
	task.mu.Lock()
	status := task.Status
	task.mu.Unlock()
	if status != "running" {
		return "", false
	}
	return id, true
}

func (m *ChatTaskManager) scheduleCleanup(id string) {
	time.AfterFunc(chatTaskTTL, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		task := m.tasks[id]
		if task == nil {
			return
		}
		task.mu.Lock()
		running := task.Status == "running"
		task.mu.Unlock()
		if !running {
			delete(m.tasks, id)
		}
	})
}

func newChatTaskID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("chat-%d", time.Now().UnixNano())
	}
	return "chat-" + hex.EncodeToString(buf)
}
