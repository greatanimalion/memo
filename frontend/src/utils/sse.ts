/**
 * SSE 流式响应的通用解析工具。
 *
 * 原先 chat.tsx 与 BookAgentModal.tsx 各维护了一份完全相同的实现，
 * 这里统一收敛，避免两处逻辑漂移。
 */

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * 从流式缓冲区中切分出完整 SSE 事件。
 * 返回已完整的事件列表，以及在最后一次分隔符之后、尚未成帧的剩余内容。
 */
export function parseSSEBuffer(buffer: string): {
  events: SSEEvent[];
  remaining: string;
} {
  const events: SSEEvent[] = [];
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() || "";
  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        // 多行数据在 SSE 中会拆成多条 data: 行，这里按原换行拼回
        dataLines.push(line.slice(6));
      }
    }
    // 纯注释帧（: connected / : keep-alive）没有 data 行，忽略即可
    if (dataLines.length === 0) continue;
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, remaining };
}

/** 按后端约定分类的 SSE 事件处理器；未提供的类型会被忽略。 */
export interface SSEHandlers {
  /** 用户提问（服务端回显） */
  user_message?: (data: string) => void;
  /** 进入某个 Agent 节点，JSON：{ name } */
  agent?: (data: string) => void;
  /** 发起工具调用，JSON：{ agent?, name } */
  tool_call?: (data: string) => void;
  /** 工具执行完成，JSON：{ agent?, name, result } */
  tool?: (data: string) => void;
  /** 章节写库成功，JSON：{ agent?, chapterId, title, order, created } */
  chapter_saved?: (data: string) => void;
  /** 第三方大模型的流式文本（纯文本） */
  message?: (data: string) => void;
  /** 异常消息（纯文本） */
  error?: (data: string) => void;
  /** 任务被取消（纯文本） */
  cancel?: (data: string) => void;
  /** 流正常结束（纯文本） */
  done?: (data: string) => void;
}

/**
 * 按事件类型分发一次 SSE 事件，与后端的事件分类保持一致：
 * agent / tool_call / tool / chapter_saved / message / user_message / error / cancel / done。
 * 未知类型只打印日志，不中断流。
 */
export function dispatchSSE(evt: SSEEvent, handlers: SSEHandlers): void {
  switch (evt.event) {
    case "user_message":
      handlers.user_message?.(evt.data);
      break;
    case "agent":
      handlers.agent?.(evt.data);
      break;
    case "tool_call":
      handlers.tool_call?.(evt.data);
      break;
    case "tool":
      handlers.tool?.(evt.data);
      break;
    case "chapter_saved":
      handlers.chapter_saved?.(evt.data);
      break;
    case "message":
      handlers.message?.(evt.data);
      break;
    case "error":
      handlers.error?.(evt.data);
      break;
    case "cancel":
      handlers.cancel?.(evt.data);
      break;
    case "done":
      handlers.done?.(evt.data);
      break;
    default:
      console.log("未知 SSE 事件:", evt.event, evt.data);
      break;
  }
}

/** 安全解析 JSON 载荷，失败返回 null（tool / agent 等结构化事件）。 */
export function parseSSEPayload<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
