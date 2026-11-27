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

// 后台写书任务：任务生命周期与 HTTP 连接解耦，前端凭 taskId 轮询事件，
// 切页/刷新后可以重新拉取并恢复正在生成的回答。

// TaskEvent 是任务运行期间产生的一条流式事件，Seq 从 0 递增。
type TaskEvent struct {
	Seq  int    `json:"seq"`
	Type string `json:"type"`
	Data string `json:"data"`
}

// TaskSnapshot 是任务状态查询结果，Events 只返回请求区间内的事件。
type TaskSnapshot struct {
	ID      string      `json:"id"`
	BookID  string      `json:"bookId"`
	Status  string      `json:"status"`
	Events  []TaskEvent `json:"events"`
	NextSeq int         `json:"nextSeq"`
}

// BookAgentTask 是一次后台写书任务的运行状态与事件缓冲。
type BookAgentTask struct {
	ID        string    `json:"id"`
	BookID    string    `json:"bookId"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	mu     sync.Mutex
	events []TaskEvent
	cancel context.CancelFunc
}

// taskEmitter 把 RunBookAgent 的 SSE 输出写入任务事件缓冲。
type taskEmitter struct{ task *BookAgentTask }

func (e taskEmitter) Write(event, data string) { e.task.append(event, data) }

func (t *BookAgentTask) append(event, data string) {
	t.mu.Lock()
	t.events = append(t.events, TaskEvent{Seq: len(t.events), Type: event, Data: data})
	t.UpdatedAt = time.Now()
	t.mu.Unlock()
}

// finish 根据最后一条终态事件确定任务状态；RunBookAgent 正常返回且
// 没有显式终态事件时视为 done。
func (t *BookAgentTask) finish() {
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

// BookAgentTaskManager 管理进行中与刚结束的写书任务。
type BookAgentTaskManager struct {
	mu         sync.Mutex
	tasks      map[string]*BookAgentTask
	lastByBook map[string]string
}

// 任务结束后保留一段时间，便于前端拉取最终状态；超时后回收内存。
const bookAgentTaskTTL = 30 * time.Minute

var defaultBookAgentTaskManager = &BookAgentTaskManager{
	tasks:      map[string]*BookAgentTask{},
	lastByBook: map[string]string{},
}

// BookAgentTasks 返回全局任务管理器。
func BookAgentTasks() *BookAgentTaskManager { return defaultBookAgentTaskManager }

// Start 在后台启动写书任务并立即返回；req.RequestID 为空时自动生成。
func (m *BookAgentTaskManager) Start(req agent.BookAgentRequest) *BookAgentTask {
	id := strings.TrimSpace(req.RequestID)
	if id == "" {
		id = newBookAgentTaskID()
	}
	req.RequestID = id

	ctx, cancel := context.WithCancel(context.Background())
	task := &BookAgentTask{
		ID:        id,
		BookID:    req.BookID,
		Status:    "running",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		cancel:    cancel,
	}

	m.mu.Lock()
	if old, ok := m.tasks[id]; ok {
		// 重复的 requestId：先终止旧任务，避免同时写同一本书。
		old.cancel()
	}
	m.tasks[id] = task
	m.lastByBook[req.BookID] = id
	m.mu.Unlock()

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				task.append("error", fmt.Sprintf("写书任务异常终止: %v", rec))
			}
			task.finish()
			cancel()
			m.scheduleCleanup(id)
		}()
		agent.RunBookAgent(ctx, req, taskEmitter{task})
	}()

	return task
}

// Snapshot 返回任务状态与 [from, from+limit) 区间内的事件。
func (m *BookAgentTaskManager) Snapshot(id string, from, limit int) (TaskSnapshot, bool) {
	m.mu.Lock()
	task := m.tasks[id]
	m.mu.Unlock()
	if task == nil {
		return TaskSnapshot{}, false
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

	return TaskSnapshot{
		ID:      task.ID,
		BookID:  task.BookID,
		Status:  task.Status,
		Events:  events,
		NextSeq: end,
	}, true
}

// Cancel 取消进行中的任务；任务不存在返回 false。
func (m *BookAgentTaskManager) Cancel(id string) bool {
	m.mu.Lock()
	task := m.tasks[id]
	m.mu.Unlock()
	if task == nil {
		return false
	}
	task.cancel()
	return true
}

// ActiveByBook 返回该书籍当前进行中的任务 id。
func (m *BookAgentTaskManager) ActiveByBook(bookID string) (string, bool) {
	m.mu.Lock()
	id, ok := m.lastByBook[bookID]
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

func (m *BookAgentTaskManager) scheduleCleanup(id string) {
	time.AfterFunc(bookAgentTaskTTL, func() {
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

func newBookAgentTaskID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("book-agent-%d", time.Now().UnixNano())
	}
	return "book-agent-" + hex.EncodeToString(buf)
}
