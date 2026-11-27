import { getApiBase, getAuthHeaders } from "@renderer/utils/apiBase";

/**
 * 后台写书任务接口。
 *
 * 写书流程由服务端在后台运行，前端只凭 taskId 轮询事件；
 * 因此切换页面（甚至刷新）后可以重新拉取并恢复正在生成的回答。
 */

export type BookAgentTaskStatus = "running" | "done" | "error" | "cancelled";

export interface BookAgentTaskEvent {
  seq: number;
  type: string;
  data: string;
}

export interface BookAgentTaskSnapshot {
  id: string;
  bookId: string;
  status: BookAgentTaskStatus;
  events: BookAgentTaskEvent[];
  nextSeq: number;
}

export interface StartBookAgentTaskBody {
  prompt: string;
  bookId: string;
  model: string;
  baseUrl: string;
  apiKey: string;
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

/** 启动后台写书任务，立即返回 taskId。 */
export function startBookAgentTask(
  body: StartBookAgentTaskBody,
): Promise<{ taskId: string; status: string }> {
  return requestJSON("/api/book-agent/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 拉取任务状态与 from 之后的事件（分页）。 */
export function fetchBookAgentTask(
  taskId: string,
  from = 0,
  limit = 500,
): Promise<BookAgentTaskSnapshot> {
  const query = new URLSearchParams({ from: String(from), limit: String(limit) });
  return requestJSON(`/api/book-agent/tasks/${encodeURIComponent(taskId)}?${query}`);
}

/** 取消后台任务。 */
export async function cancelBookAgentTask(taskId: string): Promise<void> {
  await requestJSON(`/api/book-agent/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  });
}

/** 查询某本书当前进行中的任务 id；没有则返回空字符串。 */
export async function getActiveBookAgentTask(bookId: string): Promise<string> {
  const query = new URLSearchParams({ bookId });
  const data = await requestJSON<{ taskId?: string }>(
    `/api/book-agent/active?${query}`,
  );
  return data.taskId || "";
}

// ───────── 本地记录进行中的 taskId（切页/刷新后据此恢复） ─────────

const ACTIVE_TASK_PREFIX = "book-agent-active-task:";

export function saveActiveBookAgentTask(bookId: string, taskId: string): void {
  try {
    localStorage.setItem(`${ACTIVE_TASK_PREFIX}${bookId}`, taskId);
  } catch {
    // localStorage 不可用时忽略，仅影响切页恢复
  }
}

export function getSavedBookAgentTask(bookId: string): string {
  try {
    return localStorage.getItem(`${ACTIVE_TASK_PREFIX}${bookId}`) || "";
  } catch {
    return "";
  }
}

export function clearActiveBookAgentTask(bookId: string): void {
  try {
    localStorage.removeItem(`${ACTIVE_TASK_PREFIX}${bookId}`);
  } catch {
    // 忽略
  }
}
