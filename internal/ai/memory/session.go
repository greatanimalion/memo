package memory

import (
	"context"
	"sync"
)

// 请求会话控制：以 requestId 为键保存进行中请求的取消函数，供前端主动中止。
// 生产多实例部署时可替换为 Redis 等共享存储，当前实现为进程内内存。
var (
	abortMu       sync.Mutex
	abortControls = map[string]context.CancelFunc{}
)

// RegisterAbort 保存进行中请求的取消函数。
func RegisterAbort(requestID string, cancel context.CancelFunc) {
	abortMu.Lock()
	defer abortMu.Unlock()
	abortControls[requestID] = cancel
}

// UnregisterAbort 在请求结束后删除对应条目。
func UnregisterAbort(requestID string) {
	abortMu.Lock()
	defer abortMu.Unlock()
	delete(abortControls, requestID)
}

// AbortRequest 取消指定 id 的请求。返回该请求是否存在
// （false 表示调用方应返回 404）。
func AbortRequest(requestID string) bool {
	abortMu.Lock()
	cancel, ok := abortControls[requestID]
	if ok {
		delete(abortControls, requestID)
	}
	abortMu.Unlock()
	if ok {
		cancel()
	}
	return ok
}
