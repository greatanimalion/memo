/**
 * 聊天页「正在进行的流式回答」全局注册表。
 *
 * 原先累积文本、思考态、工具状态都放在 chat.tsx 的组件 state 里，
 * 页面一旦卸载（切换路由/页面），这些状态随组件一起丢失，
 * 虽然底层 fetch 仍在跑、最终也会落库，但用户返回时看不到正在生成的回答。
 *
 * 这里把运行态提升到模块级：页面切走不中断、不清空，返回后按 sessionId
 * 重新读取并订阅，即可原样续上正在输出的内容。
 *
 * 收敛说明：运行记录改为「不可变更新」（每次变化生成新对象），
 * 页面可直接用 useSyncExternalStore 订阅，不再在各处镜像一套组件 state。
 */

export type ChatRunStatus = "running" | "done" | "error" | "cancelled";

export interface ChatLiveRun {
  sessionId: string;
  /** 后端任务 id，取消 / 恢复时使用 */
  taskId: string;
  /** 已累积的正文（与页面展示保持一致） */
  content: string;
  /** 工具状态提示，例如「正在调用工具：xxx…」 */
  toolStatus: string;
  status: ChatRunStatus;
  /** 起始时间戳，用于展示回复时间 */
  startedAt: number;
}

type Listener = (run: ChatLiveRun | null) => void;

const runs = new Map<string, ChatLiveRun>();
const listeners = new Map<string, Set<Listener>>();
// 结束后保留一小段时间，供刚返回的页面读取最终状态
const KEEP_AFTER_FINISH = 60 * 1000;

function notify(sessionId: string): void {
  const run = runs.get(sessionId) ?? null;
  listeners.get(sessionId)?.forEach((listener) => listener(run));
}

/** 以不可变方式更新运行记录并通知订阅者。 */
function patch(sessionId: string, next: Partial<ChatLiveRun>): void {
  const run = runs.get(sessionId);
  if (!run) return;
  runs.set(sessionId, { ...run, ...next });
  notify(sessionId);
}

/** 发起一轮新的回答，清空该会话旧的运行记录。 */
export function beginChatRun(sessionId: string, taskId = ""): void {
  if (!sessionId) return;
  runs.set(sessionId, {
    sessionId,
    taskId,
    content: "",
    toolStatus: "",
    status: "running",
    startedAt: Date.now(),
  });
  notify(sessionId);
}

/** 追加一段模型输出。 */
export function appendChatRun(sessionId: string, delta: string): void {
  const run = runs.get(sessionId);
  if (!run) return;
  patch(sessionId, { content: run.content + delta });
}

/** 更新工具调用提示。 */
export function setChatRunToolStatus(
  sessionId: string,
  toolStatus: string,
): void {
  patch(sessionId, { toolStatus });
}

/** 回填后端返回的真实任务 id。 */
export function setChatRunTaskId(sessionId: string, taskId: string): void {
  patch(sessionId, { taskId });
}

/** 结束本轮回答，并延迟回收记录。 */
export function finishChatRun(sessionId: string, status: ChatRunStatus): void {
  const run = runs.get(sessionId);
  if (!run) return;
  patch(sessionId, { status });
  setTimeout(() => {
    // 若期间又开了新一轮，不要误删新记录
    const current = runs.get(sessionId);
    if (current && current.status !== "running") {
      runs.delete(sessionId);
      notify(sessionId);
    }
  }, KEEP_AFTER_FINISH);
}

/** 读取某会话当前的运行记录（没有则为 null）。 */
export function getChatRun(sessionId: string): ChatLiveRun | null {
  return runs.get(sessionId) ?? null;
}

/** 同步列出内存中正在运行的会话（用于首屏找出需要恢复的会话）。 */
export function listRunningChatSessions(): string[] {
  const ids: string[] = [];
  runs.forEach((run) => {
    if (run.status === "running") ids.push(run.sessionId);
  });
  return ids;
}

/** 订阅某会话的运行记录变化，返回取消订阅函数。 */
export function subscribeChatRun(
  sessionId: string,
  listener: Listener,
): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(sessionId);
  };
}
