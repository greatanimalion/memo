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
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, remaining };
}
