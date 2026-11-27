import { getApiBase, getAuthHeaders } from "@renderer/utils/apiBase";
import type { Message } from "@type/session";

/**
 * 后台聊天任务接口。
 *
 * 聊天请求由服务端在后台运行，前端只凭 taskId 轮询事件；
 * 切页、甚至整页刷新后都可以重新拉取并恢复正在生成的回答。
 */

export type ChatTaskStatus = "running" | "done" | "error" | "cancelled";

export interface ChatTaskEvent {
  seq: number;
  type: string;
  data: string;
}

export interface ChatTaskSnapshot {
  id: string;
  sessionId: string;
  status: ChatTaskStatus;
  events: ChatTaskEvent[];
  nextSeq: number;
}

export interface StartChatTaskBody {
  agent: boolean;
  sessionId: string;
  prompt: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  history: Message[];
  requestId: string;
}

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `请求失败(${response.status})`);
  }
  return (await response.json()) as T;
}

/** 启动后台聊天任务，立即返回 taskId。 */
export function startChatTask(
  body: StartChatTaskBody,
): Promise<{ taskId: string; status: string }> {
  return requestJSON("/api/chat/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 拉取任务状态与 from 之后的事件（分页）。 */
export function fetchChatTask(
  taskId: string,
  from = 0,
  limit = 500,
): Promise<ChatTaskSnapshot> {
  const query = new URLSearchParams({ from: String(from), limit: String(limit) });
  return requestJSON(`/api/chat/tasks/${encodeURIComponent(taskId)}?${query}`);
}

/** 取消后台任务。 */
export async function cancelChatTask(taskId: string): Promise<void> {
  await requestJSON(`/api/chat/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  });
}

/** 查询某会话当前进行中的任务 id；没有则返回空字符串。 */
export async function getActiveChatTask(sessionId: string): Promise<string> {
  const query = new URLSearchParams({ sessionId });
  const data = await requestJSON<{ taskId?: string }>(
    `/api/chat/active?${query}`,
  );
  return data.taskId || "";
}

// ───────── 本地记录进行中的 taskId（整页刷新后据此恢复） ─────────

const ACTIVE_TASK_PREFIX = "chat-active-task:";

export function saveActiveChatTask(sessionId: string, taskId: string): void {
  try {
    localStorage.setItem(`${ACTIVE_TASK_PREFIX}${sessionId}`, taskId);
  } catch {
    // localStorage 不可用时忽略，仅影响刷新恢复
  }
}

export function getSavedChatTask(sessionId: string): string {
  try {
    return localStorage.getItem(`${ACTIVE_TASK_PREFIX}${sessionId}`) || "";
  } catch {
    return "";
  }
}

export function clearActiveChatTask(sessionId: string): void {
  try {
    localStorage.removeItem(`${ACTIVE_TASK_PREFIX}${sessionId}`);
  } catch {
    // 忽略
  }
}

/** 同步列出本地记录过「进行中任务」的会话，用于首屏判断需要恢复哪些会话。 */
export function listSavedChatSessions(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ACTIVE_TASK_PREFIX)) {
        ids.push(key.slice(ACTIVE_TASK_PREFIX.length));
      }
    }
  } catch {
    // localStorage 不可用时返回空列表
  }
  return ids;
}
