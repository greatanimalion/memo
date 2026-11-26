package service

import (
	"context"

	"memo/internal/ai/agent"
	"memo/internal/ai/memory"
)

// ChatService 是 HTTP 层之下的业务入口：负责会话生命周期（启动流式对话、
// 中止进行中的请求），协议解析与响应输出留在 handler 层。
type ChatService struct{}

// ChatStream 启动不带工具的纯流式补全。
func (ChatService) ChatStream(ctx context.Context, req agent.ChatRequest, sse agent.Emitter) {
	agent.RunChatStream(ctx, req, sse)
}

// Agent 启动带工具调用的 ReAct 循环。
func (ChatService) Agent(ctx context.Context, req agent.ChatRequest, sse agent.Emitter) {
	agent.RunAgent(ctx, req, sse)
}

// BookAgent 启动多 Agent 写书工作流。
func (ChatService) BookAgent(ctx context.Context, req agent.BookAgentRequest, sse agent.Emitter) {
	agent.RunBookAgent(ctx, req, sse)
}

// Abort 取消指定 requestId 的进行中请求；返回 false 表示不存在。
func (ChatService) Abort(requestID string) bool {
	return memory.AbortRequest(requestID)
}
