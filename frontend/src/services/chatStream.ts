import { getApiUrl } from "@renderer/utils";
import { getAuthHeaders } from "@renderer/utils/apiBase";
import { dispatchSSE, consumeSSEStream, parseSSEPayload } from "@renderer/utils/sse";
import type { Message } from "@type/session";

/**
 * 聊天流式请求层。
 *
 * 原先 chat.tsx 的 handleSend 里同时承担 fetch、SSE 拆帧、事件分发和
 * 错误转换；这里把这些与界面无关的细节收敛成一个函数，页面只关心回调。
 */

export interface ChatStreamParams {
  /** true 走 /api/chat-agent（带工具），false 走 /api/chat-stream。 */
  agent: boolean;
  prompt: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  history: Message[];
  requestId: string;
  /** 收到文本增量时回调。 */
  onDelta?: (delta: string) => void;
  /** 模型开始调用工具时回调。 */
  onToolCall?: (name: string) => void;
  /** 工具执行完成时回调。 */
  onToolResult?: (name: string) => void;
}

/** 进行中的流式请求，按 requestId 索引，供停止按钮立即中断前端读取。 */
const activeControllers = new Map<string, AbortController>();

/** 立即中断指定请求的前端读取（后端取消仍由 cancelChat 负责）。 */
export function abortChatStream(requestId: string): void {
  activeControllers.get(requestId)?.abort();
}

/**
 * 发起一次流式对话，返回累积后的完整正文。
 *
 * 抛出的错误约定：
 * - 服务端 error 事件 → Error(data)；
 * - 服务端 cancel 事件或前端主动中断 → 名称 AbortError 的 DOMException。
 */
export async function streamChat(params: ChatStreamParams): Promise<string> {
  const controller = new AbortController();
  activeControllers.set(params.requestId, controller);

  try {
    const url = getApiUrl(`/api/${params.agent ? "chat-agent" : "chat-stream"}`);
    /* ===== 旧实现（保留备查，已由 consumeSSEStream 替代） =====
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        history: params.history,
        requestId: params.requestId,
      }),
      signal: controller.signal,
    });
    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedContent = "";
    let sseBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEBuffer(sseBuffer);
        sseBuffer = remaining;

        for (const evt of events) {
          // 按后端事件分类分发：message=模型文本，tool_call/tool=工具步骤
          dispatchSSE(evt, {
            message: (data) => {
              accumulatedContent += data;
              params.onDelta?.(data);
            },
            tool_call: (data) => {
              const payload = parseSSEPayload<{ name?: string }>(data);
              if (payload?.name) params.onToolCall?.(payload.name);
            },
            tool: (data) => {
              const payload = parseSSEPayload<{ name?: string }>(data);
              if (payload?.name) params.onToolResult?.(payload.name);
            },
            error: (data) => {
              throw new Error(data);
            },
            cancel: () => {
              throw new DOMException("请求已取消", "AbortError");
            },
            // agent / user_message / done 由写书流程使用，聊天接口不会下发
          });
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulatedContent;
    ===== 旧实现结束 ===== */

    // 新实现：消费循环收敛到 consumeSSEStream，页面/服务只关心事件分发
    let accumulatedContent = "";
    await consumeSSEStream({
      url,
      body: {
        prompt: params.prompt,
        model: params.model,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        history: params.history,
        requestId: params.requestId,
      },
      signal: controller.signal,
      onEvent: (evt) => {
        // 按后端事件分类分发：message=模型文本，tool_call/tool=工具步骤
        dispatchSSE(evt, {
          message: (data) => {
            accumulatedContent += data;
            params.onDelta?.(data);
          },
          tool_call: (data) => {
            const payload = parseSSEPayload<{ name?: string }>(data);
            if (payload?.name) params.onToolCall?.(payload.name);
          },
          tool: (data) => {
            const payload = parseSSEPayload<{ name?: string }>(data);
            if (payload?.name) params.onToolResult?.(payload.name);
          },
          error: (data) => {
            throw new Error(data);
          },
          cancel: () => {
            throw new DOMException("请求已取消", "AbortError");
          },
          // agent / user_message / done 由写书流程使用，聊天接口不会下发
        });
      },
    });

    return accumulatedContent;
  } finally {
    if (activeControllers.get(params.requestId) === controller) {
      activeControllers.delete(params.requestId);
    }
  }
}
