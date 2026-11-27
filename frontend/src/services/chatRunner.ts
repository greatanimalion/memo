import type { Message } from "@type/session";
import {
  appendChatRun,
  beginChatRun,
  finishChatRun,
  getChatRun,
  listRunningChatSessions,
  setChatRunTaskId,
  setChatRunToolStatus,
} from "./chatLive";
import type { ChatLiveRun, ChatRunStatus } from "./chatLive";
import {
  cancelChatTask,
  clearActiveChatTask,
  fetchChatTask,
  getActiveChatTask,
  getSavedChatTask,
  listSavedChatSessions,
  saveActiveChatTask,
  startChatTask,
} from "./chatTask";
import type { ChatTaskEvent, ChatTaskStatus } from "./chatTask";
import { getAllSession, updateSession } from "./session";

/**
 * 聊天任务运行器（模块级，不随页面卸载）。
 *
 * 聊天请求交给后端后台任务执行，这里负责：
 *  - 启动任务并记下 taskId（localStorage 便于整页刷新后恢复）
 *  - 按 Seq 轮询增量事件，把正文/工具状态同步到 chatLive
 *  - 任务结束后把最终 AI 消息落库，并结束运行态
 *
 * 页面只订阅 chatLive 做展示，不再自己持有流式状态。
 */

export interface StartChatRunParams {
  sessionId: string;
  agent: boolean;
  prompt: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  history: Message[];
}

// 每个会话只允许一个轮询在跑：新的轮询会让旧轮询失效
const pollTokens = new Map<string, number>();
// 会话 -> 正在轮询的 taskId
const activePolls = new Map<string, string>();

// 轮询间隔（毫秒）
const POLL_INTERVAL = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newRequestId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 尽量从事件 data 中取出工具名（tool_call / tool 事件都是 JSON）。 */
function parseToolName(data: string): string {
  try {
    const obj = JSON.parse(data) as { name?: string };
    return obj?.name || "";
  } catch {
    return "";
  }
}

/** 把一条任务事件同步到运行态。 */
function applyTaskEvent(sessionId: string, evt: ChatTaskEvent): void {
  switch (evt.type) {
    case "message":
      appendChatRun(sessionId, evt.data);
      break;
    case "tool_call": {
      const name = parseToolName(evt.data);
      setChatRunToolStatus(
        sessionId,
        name ? `正在调用工具：${name}…` : "正在调用工具…",
      );
      break;
    }
    case "tool": {
      const name = parseToolName(evt.data);
      setChatRunToolStatus(
        sessionId,
        name ? `工具 ${name} 已完成` : "工具调用已完成",
      );
      break;
    }
    default:
      // error / cancel / done 由任务状态统一收尾
      break;
  }
}

/** 启动一轮后台聊天任务；失败时把错误写入会话并结束运行态。 */
export async function startChatRun(params: StartChatRunParams): Promise<void> {
  const { sessionId } = params;
  const requestId = newRequestId();

  // 先占位运行态，保证页面切走前就能读到本轮回答
  beginChatRun(sessionId, requestId);
  saveActiveChatTask(sessionId, requestId);

  try {
    const { taskId } = await startChatTask({
      agent: params.agent,
      sessionId,
      prompt: params.prompt,
      model: params.model,
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      history: params.history,
      requestId,
    });
    const realId = taskId || requestId;
    saveActiveChatTask(sessionId, realId);
    setChatRunTaskId(sessionId, realId);
    void pollChatTask(sessionId, realId, 0);
  } catch (error) {
    clearActiveChatTask(sessionId);
    const detail =
      error instanceof Error ? error.message.trim() : String(error || "").trim();
    try {
      await persistChatResult(sessionId, "", "error", detail);
    } catch (persistError) {
      console.error("保存失败消息失败:", persistError);
    }
    finishChatRun(sessionId, "error");
    throw error;
  }
}

/** 循环拉取任务事件，直到任务结束；结束时落库并结束运行态。 */
async function pollChatTask(
  sessionId: string,
  taskId: string,
  from: number,
): Promise<void> {
  const token = (pollTokens.get(sessionId) || 0) + 1;
  pollTokens.set(sessionId, token);
  activePolls.set(sessionId, taskId);

  let seq = from;
  let status: ChatTaskStatus = "running";
  let errorText = "";

  try {
    for (;;) {
      if (pollTokens.get(sessionId) !== token) return;

      let snap;
      try {
        snap = await fetchChatTask(taskId, seq);
      } catch (error) {
        // 任务已不存在（后端重启 / 超时回收）：按失败收尾
        status = "error";
        errorText =
          error instanceof Error ? error.message : String(error || "");
        break;
      }

      if (pollTokens.get(sessionId) !== token) return;

      for (const evt of snap.events) {
        applyTaskEvent(sessionId, evt);
        if (evt.type === "error") errorText = evt.data;
        seq = evt.seq + 1;
      }

      if (snap.status === "running") {
        await sleep(POLL_INTERVAL);
        continue;
      }
      status = snap.status;
      break;
    }
  } finally {
    if (pollTokens.get(sessionId) !== token) return;
    activePolls.delete(sessionId);
    clearActiveChatTask(sessionId);

    const content = getChatRun(sessionId)?.content || "";
    try {
      await persistChatResult(sessionId, content, status, errorText);
    } catch (error) {
      console.error("保存 AI 回答失败:", error);
    }
    finishChatRun(sessionId, status);
  }
}

/** 把最终 AI 消息写入会话；重复内容（刷新后重放）跳过。 */
async function persistChatResult(
  sessionId: string,
  content: string,
  status: ChatRunStatus,
  errorText = "",
): Promise<void> {
  // 用户主动取消：保留用户消息，不写入半截回答
  if (status === "cancelled") return;

  const text =
    status === "done"
      ? content
      : errorText.trim()
        ? `AI 调用失败：${errorText.trim()}`
        : "抱歉，我在处理您的请求时遇到了问题，请稍后重试。";
  if (!text) return;

  const sessions = await getAllSession();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return;

  const messages = session.messages || [];
  const last = messages[messages.length - 1];
  // 去重：整页刷新后重放已结束任务时，最后一条已是同一条 AI 消息
  if (last && last.role === "system" && last.content === text) return;

  await updateSession({
    ...session,
    messages: [
      ...messages,
      { role: "system", content: text, timestamp: Date.now() },
    ],
    lastUpdated: Date.now(),
  });
}

/**
 * 恢复某会话的运行态（切页 / 整页刷新后调用），统一的恢复入口：
 *  1. 内存里已有运行记录：直接返回（轮询意外中断则重新接上）
 *  2. 内存为空：按本地/后端记录的 taskId 探测任务，从 Seq 0 重放全部事件
 *  3. 探测失败（后端重启 / 任务已回收）：返回 null，交由本地暂存弹窗兜底
 *
 * 任务已结束时由 persistChatResult 去重补写数据库，
 * 覆盖「刷新后任务才完成」的窗口。
 */
export async function restoreChatSession(
  sessionId: string,
): Promise<ChatLiveRun | null> {
  if (!sessionId) return null;

  const existing = getChatRun(sessionId);
  if (existing) {
    // 内存有运行态但没有轮询在跑（异常中断）：凭 taskId 重新接上
    if (existing.status === "running" && !activePolls.has(sessionId)) {
      if (existing.taskId) void pollChatTask(sessionId, existing.taskId, 0);
    }
    return existing;
  }
  if (activePolls.has(sessionId)) return getChatRun(sessionId);

  let taskId = getSavedChatTask(sessionId);
  if (!taskId) {
    try {
      taskId = await getActiveChatTask(sessionId);
    } catch {
      taskId = "";
    }
  }
  if (!taskId) return null;

  // 探测任务是否仍存在（后端可能已重启）
  try {
    await fetchChatTask(taskId, 0, 1);
  } catch {
    clearActiveChatTask(sessionId);
    return null;
  }

  saveActiveChatTask(sessionId, taskId);
  beginChatRun(sessionId, taskId);
  void pollChatTask(sessionId, taskId, 0);
  return getChatRun(sessionId);
}

/**
 * 同步列出「可能有进行中回答」的会话：
 * 内存运行记录 + localStorage 中的任务标记，无需逐个会话发请求。
 */
export function listActiveChatSessions(): string[] {
  const ids = new Set<string>();
  listRunningChatSessions().forEach((id) => ids.add(id));
  listSavedChatSessions().forEach((id) => ids.add(id));
  return [...ids];
}

/** 判断某会话是否有进行中的后台任务（用于返回页面时自动切会话）。 */
export async function hasRunningChatTask(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  if (getChatRun(sessionId)?.status === "running") return true;

  const taskId = getSavedChatTask(sessionId);
  if (!taskId) return false;

  try {
    const snap = await fetchChatTask(taskId, 0, 1);
    return snap.status === "running";
  } catch {
    clearActiveChatTask(sessionId);
    return false;
  }
}

/** 取消某会话进行中的后台任务。 */
export async function cancelChatRun(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const taskId =
    getSavedChatTask(sessionId) || getChatRun(sessionId)?.taskId || "";
  if (!taskId) return;
  try {
    await cancelChatTask(taskId);
  } catch (error) {
    console.error("取消聊天任务失败:", error);
  }
}
