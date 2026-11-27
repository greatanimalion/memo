// 右侧 AI 写书对话：基于 ant-design/x 的思考链 / 气泡 / 输入框，
// 负责请求 book-agent SSE、渲染多 Agent 步骤、删除某段对话。
// 左右分栏的布局与拖拽由 AgentEditor 负责，本组件只渲染右栏内容。

import { useCallback, useEffect, useRef, useState } from "react";
import { Bubble, Sender, Think, ThoughtChain } from "@ant-design/x";
import { XMarkdown } from "@ant-design/x-markdown";
import { Button, Flex, Modal, message as antdMessage } from "antd";
import {
  CloseOutlined,
  CodeOutlined,
  DeleteOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useWriterStore } from "@renderer/store/useWriterStore";
import {
  deleteBookAgent,
  getBookAgentsByBookId,
} from "@renderer/services/bookAgent";
// 原 parseSSEBuffer 仅用于同步 SSE 消费，已改为后台任务轮询
// import { dispatchSSE, parseSSEBuffer } from "@renderer/utils/sse";
import { dispatchSSE, parseSSEPayload } from "@renderer/utils/sse";
import type { SSEEvent } from "@renderer/utils/sse";
import {
  cancelBookAgentTask,
  clearActiveBookAgentTask,
  fetchBookAgentTask,
  getActiveBookAgentTask,
  getSavedBookAgentTask,
  saveActiveBookAgentTask,
  startBookAgentTask,
} from "@renderer/services/bookAgentTask";
// 原实现：同步 SSE 消费（已由后台任务 + 轮询替代）
// import { consumeSSEStream } from "@renderer/utils/sse";
// import { getApiUrl } from "@renderer/utils";
// import { getAuthHeaders } from "@renderer/utils/apiBase";
import type { AIKey } from "@renderer/types/common";
import type { BookAgent } from "@type/book";
import { getLocalStore } from "@renderer/utils/localStore";
import { resolveModelConfig } from "@renderer/utils/helper";

interface BookAgentPanelProps {
  /** 左侧章节预览是否显示，用于切换收起/展开箭头方向 */
  leftVisible: boolean;
  /** 收起 / 展开左侧章节预览 */
  onToggleLeft: () => void;
  /** 返回普通编辑器（由 book.tsx 控制 AgentEditor / ManusEditor 的切换） */
  onClose?: () => void;
}

type ChatRole = "user" | "ai";
type ChatStatus = "local" | "loading" | "updating" | "success" | "error" | "abort";

/** 单个 Agent 步骤里的一次工具调用（渲染为嵌套的 ThoughtChain.Item）。 */
interface ChatToolStep {
  key: string;
  name: string;
  status: "loading" | "success" | "error";
  /** 工具返回结果的文本 */
  result?: string;
}

interface ChatMessage {
  key: string;
  role: ChatRole;
  content: string;
  /** 产生该段内容的 Agent 名称，用于思考链节点标题 */
  agent?: string;
  status?: ChatStatus;
  /** 同一次请求/同一条历史记录的标识，用于把多个 Agent 串成一条思考链 */
  runKey?: string;
  /** 该步骤内发起的工具调用（按顺序展示） */
  tools?: ChatToolStep[];
}

type ChatBlock =
  | { kind: "user"; key: string; content: string; runKey: string }
  | { kind: "thought"; key: string; runKey: string; steps: ChatMessage[] };

/** 把消息按「用户提问 + 一次运行内的多 Agent 步骤」切分成渲染块。 */
function groupMessages(messages: ChatMessage[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      blocks.push({
        kind: "user",
        key: msg.key,
        content: msg.content,
        // 用户消息与同一次运行的所有 Agent 步骤共享 runKey，便于整段删除
        runKey: msg.runKey || msg.key,
      });
      continue;
    }
    const runKey = msg.runKey || msg.key;
    const last = blocks[blocks.length - 1];
    if (last && last.kind === "thought" && last.runKey === runKey) {
      last.steps.push(msg);
    } else {
      blocks.push({ kind: "thought", key: `t-${msg.key}`, runKey, steps: [msg] });
    }
  }
  return blocks;
}

/** 写书 Agent 的中文名称，对应后端 SSE 的 agent 事件。 */
const AGENT_LABELS: Record<string, string> = {
  orchestrator: "总调度",
  architect: "章纲规划",
  character: "角色决策",
  writer: "正文写作",
  guard: "一致性校验",
};

function agentLabel(name?: string): string {
  if (!name) return "AI";
  return AGENT_LABELS[name] || name;
}

/** 工具结果可能很长（如整章正文），展示时截断，避免撑爆气泡。 */
function clipToolResult(result: unknown, max = 1200): string {
  const text =
    typeof result === "string" ? result : JSON.stringify(result ?? "");
  if (!text) return "（无返回内容）";
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
}

/** 后端保存的工具记录形如 "[工具名] 返回内容"，此处拆出名称与结果。 */
const TOOL_RECORD_RE = /^\[([^\]]+)\]\s*([\s\S]*)$/;

/** 把后端保存的历史问答转换为聊天气泡：每条记录 = 一问多答。 */
function buildHistory(
  records: BookAgent[],
  includeRunning = false,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  // 后端按 createdAt DESC 返回，转为正序
  for (const record of [...records].reverse()) {
    // 进行中的记录由后台任务重放恢复；历史列表跳过它，避免同一轮重复展示
    if (!includeRunning && record.status === "running") continue;
    out.push({
      key: `h-u-${record.id}`,
      role: "user",
      content: record.title || "（历史任务）",
      status: "success",
      // 历史记录 id 即该段的 runKey，删除时可直接作为后端记录 id
      runKey: record.id,
    });
    // 同一 Agent 的输出聚合为一条消息：正文进 content，工具调用进 tools
    const grouped = new Map<string, ChatMessage>();
    for (const msg of record.messages || []) {
      const agent = msg.agent || "orchestrator";
      let entry = grouped.get(agent);
      if (!entry) {
        entry = {
          key: `h-a-${record.id}-${agent}`,
          role: "ai",
          agent,
          content: "",
          status: "success",
          runKey: record.id,
          tools: [],
        };
        grouped.set(agent, entry);
      }
      if (msg.role === "tool") {
        const matched = TOOL_RECORD_RE.exec(msg.content || "");
        const tools = entry.tools || (entry.tools = []);
        tools.push({
          key: `h-t-${record.id}-${agent}-${tools.length}`,
          name: matched ? matched[1] : "tool",
          status: "success",
          result: matched ? matched[2] : msg.content || "",
        });
      } else {
        entry.content += `\n\n${msg.content}`;
      }
    }
    for (const entry of grouped.values()) {
      entry.content = entry.content.trim();
      out.push(entry);
    }
  }
  return out;
}

export function BookAgentPanel({
  leftVisible,
  onToggleLeft,
  onClose,
}: BookAgentPanelProps) {
  const book = useWriterStore((s) => s.book);
  const currentChapter = useWriterStore((s) => s.currentChapter);
  const loadBookById = useWriterStore((s) => s.loadBookById);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 思考链中用户手动收起的节点；默认全部展开，点击标题即可收起。
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  const activeKeyRef = useRef<string | null>(null);
  // 当前运行标识：同一次请求内的 Agent 输出串成一条思考链
  const activeRunKeyRef = useRef("");
  const seqRef = useRef(0);
  // 原实现：AbortController 直接中断 SSE；任务模式改由后台任务 + 轮询接管
  // const abortRef = useRef<AbortController | null>(null);
  // 当前进行中的后台任务 id（同时写入 localStorage，切页/刷新后据此恢复）
  const taskIdRef = useRef<string | null>(null);
  // 前端轮询令牌：递增表示旧轮询作废（组件卸载或已开始新任务）
  const pollTokenRef = useRef(0);
  // 组件是否仍在挂载：卸载时只停止轮询，不清除任务标记
  const aliveRef = useRef(true);
  // 历史消息加载完成的书 id，用于随后恢复进行中的任务
  const [historyLoadedBookId, setHistoryLoadedBookId] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // 删除对话的二次确认弹窗（跟随主题 zIndexPopupBase，避免被顶部工具栏遮挡）
  const [modal, modalContextHolder] = Modal.useModal();
  // 实时运行的 runKey（本次请求 id）→ 后端 bookAgent 记录 id 的映射：
  // 由 user_message 事件携带的 recordId 写入，删除实时对话段时用于定位后端记录
  const runRecordMapRef = useRef<Map<string, string>>(new Map());
  // 已加载的历史记录 id，判断某个 runKey 是否本身就是后端记录 id
  const knownRecordIdsRef = useRef<Set<string>>(new Set());

  // 新消息到达时滚到底部（流式输出时同样保持跟随）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const syncMessages = useCallback(() => {
    setMessages([...messagesRef.current]);
  }, []);

  const pushMessage = useCallback(
    (msg: ChatMessage) => {
      messagesRef.current = [...messagesRef.current, msg];
      syncMessages();
    },
    [syncMessages],
  );

  const patchMessage = useCallback(
    (key: string, patch: Partial<ChatMessage>) => {
      messagesRef.current = messagesRef.current.map((m) =>
        m.key === key ? { ...m, ...patch } : m,
      );
      syncMessages();
    },
    [syncMessages],
  );

  const appendToMessage = useCallback(
    (key: string, text: string) => {
      messagesRef.current = messagesRef.current.map((m) =>
        m.key === key ? { ...m, content: m.content + text } : m,
      );
      syncMessages();
    },
    [syncMessages],
  );

  /** 按键更新单条消息，供工具步骤（tools 数组）增量写入。 */
  const mutateMessage = useCallback(
    (key: string, updater: (msg: ChatMessage) => ChatMessage) => {
      messagesRef.current = messagesRef.current.map((m) =>
        m.key === key ? updater(m) : m,
      );
      syncMessages();
    },
    [syncMessages],
  );

  // 重新加载历史问答；includeRunning=true 时也展示仍在运行中的记录
  // （仅在确认没有可恢复的后台任务时使用，避免与任务重放重复）
  const loadHistory = useCallback(
    async (bookId: string, includeRunning = false) => {
      const list = await getBookAgentsByBookId(bookId);
      knownRecordIdsRef.current = new Set((list || []).map((item) => item.id));
      messagesRef.current = buildHistory(list || [], includeRunning);
      activeKeyRef.current = null;
      syncMessages();
    },
    [syncMessages],
  );

  // 打开书籍时加载历史问答
  useEffect(() => {
    if (!book?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getBookAgentsByBookId(book.id);
        if (cancelled) return;
        knownRecordIdsRef.current = new Set((list || []).map((item) => item.id));
        messagesRef.current = buildHistory(list || []);
        activeKeyRef.current = null;
        syncMessages();
        // 历史就绪后，触发另一处 effect 恢复进行中的后台任务
        setHistoryLoadedBookId(book.id);
      } catch (e) {
        console.error("加载 AI 写书历史失败:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book?.id, syncMessages]);

  // 组件卸载时只停止前端轮询，后台任务继续运行；
  // 返回页面时凭 localStorage 中的 taskId 重放事件，恢复正在生成的回答。
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      pollTokenRef.current += 1;
      // 原实现：abortRef.current?.abort();  ← 切页即中断 SSE
    };
  }, []);

  const finishActive = useCallback(
    (status: ChatStatus) => {
      const key = activeKeyRef.current;
      if (!key) return;
      const current = messagesRef.current.find((m) => m.key === key);
      // 已有终态（error/abort）时不覆盖
      if (!current || current.status !== "loading") return;
      patchMessage(key, { status });
    },
    [patchMessage],
  );

  const startAgentMessage = useCallback(
    (agent: string) => {
      // 上一个 Agent 的输出视为完成
      finishActive("success");
      const key = `a-${Date.now()}-${seqRef.current++}`;
      pushMessage({
        key,
        role: "ai",
        agent,
        content: "",
        status: "loading",
        runKey: activeRunKeyRef.current,
      });
      activeKeyRef.current = key;
    },
    [finishActive, pushMessage],
  );

  const ensureActive = useCallback(() => {
    if (activeKeyRef.current) return activeKeyRef.current;
    startAgentMessage("orchestrator");
    return activeKeyRef.current as string;
  }, [startAgentMessage]);

  // 章节写库（chapter_saved 事件）后立即刷新章节列表，
  // 不必等整轮写书流程结束才发现新章节 / 字数变化。
  const refreshingRef = useRef(false);
  const refreshChapters = useCallback(async () => {
    const bookId = useWriterStore.getState().book?.id;
    // 连续保存多章时只保留一次在途刷新，避免并发覆盖列表
    if (!bookId || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      await loadBookById(bookId);
      // 当前章节若被本次保存更新，重新拉取以同步最新的 aiRes 正文
      const state = useWriterStore.getState();
      const chapterId = state.currentChapter?.id;
      if (
        chapterId &&
        state.book.chapters.some((chapter) => chapter.id === chapterId)
      ) {
        await state.setCurrentChapter(chapterId);
      }
    } catch (error) {
      console.error("刷新章节列表失败:", error);
    } finally {
      refreshingRef.current = false;
    }
  }, [loadBookById]);

  const handleEvents = useCallback(
    (events: SSEEvent[]) => {
      for (const evt of events) {
        dispatchSSE(evt, {
          // 用户消息已由前端本地插入气泡，服务端回显无需重复展示；
          // 但需记录 recordId，建立实时 runKey（请求 id）与后端记录的映射
          user_message: (data) => {
            const payload = parseSSEPayload<{
              recordId?: string;
              content?: string;
            }>(data);
            const runKey = activeRunKeyRef.current;
            if (payload?.recordId && runKey) {
              runRecordMapRef.current.set(runKey, payload.recordId);
            }
            // 恢复进行中任务时，本地还没有该轮的用户气泡，用事件内容补一条
            if (
              payload?.content &&
              runKey &&
              !messagesRef.current.some(
                (m) => m.runKey === runKey && m.role === "user",
              )
            ) {
              pushMessage({
                key: `u-${runKey}`,
                role: "user",
                content: payload.content,
                status: "success",
                runKey,
              });
            }
          },
          agent: (data) => {
            const payload = parseSSEPayload<{ name?: string }>(data);
            if (payload?.name) startAgentMessage(payload.name);
          },
          message: (data) => {
            appendToMessage(ensureActive(), data);
          },
          tool_call: (data) => {
            const payload = parseSSEPayload<{ name?: string }>(data);
            const name = payload?.name || "unknown";
            const key = ensureActive();
            // 工具调用作为独立步骤，渲染为嵌套的 ThoughtChain.Item
            mutateMessage(key, (m) => ({
              ...m,
              tools: [
                ...(m.tools || []),
                {
                  key: `tool-${Date.now()}-${seqRef.current++}`,
                  name,
                  status: "loading",
                },
              ],
            }));
          },
          tool: (data) => {
            const payload = parseSSEPayload<{ name?: string; result?: unknown }>(data);
            const name = payload?.name || "unknown";
            // 展示后台工具的真实返回，便于确认 AI 读到了什么内容
            const result = clipToolResult(payload ? payload.result : data);
            const key = ensureActive();
            mutateMessage(key, (m) => {
              const tools = m.tools || [];
              // 从后往前找最近一个同名且仍在执行的调用
              let target = -1;
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i].status === "loading" && tools[i].name === name) {
                  target = i;
                  break;
                }
              }
              const next =
                target >= 0
                  ? tools.map((tool, index) =>
                      index === target
                        ? { ...tool, status: "success" as const, result }
                        : tool,
                    )
                  : [
                      ...tools,
                      {
                        key: `tool-${Date.now()}-${seqRef.current++}`,
                        name,
                        status: "success" as const,
                        result,
                      },
                    ];
              return { ...m, tools: next };
            });
          },
          // 章节已写库（AI 保存成功），立即刷新章节列表
          chapter_saved: () => {
            refreshChapters();
          },
          error: (data) => {
            appendToMessage(ensureActive(), `\n\n[错误] ${data}`);
            finishActive("error");
          },
          cancel: () => {
            appendToMessage(ensureActive(), "\n\n[任务已取消]");
            finishActive("abort");
          },
          done: () => finishActive("success"),
        });
      }
    },
    [appendToMessage, ensureActive, finishActive, mutateMessage, refreshChapters, startAgentMessage],
  );

  // 轮询后台任务：把新事件按 SSE 类型重放，running 期间持续拉取，
  // 终态后完成收尾。切页卸载只停止轮询，任务仍在服务端继续运行。
  const runTask = useCallback(
    async (taskId: string, bookId: string, from = 0) => {
      const token = pollTokenRef.current + 1;
      pollTokenRef.current = token;
      taskIdRef.current = taskId;
      // 任务 id 即发送时的 requestId，作为本轮 runKey，重放时串成同一条思考链
      activeRunKeyRef.current = taskId;
      setRequestId(taskId);
      setStreaming(true);
      saveActiveBookAgentTask(bookId, taskId);

      let seq = from;
      let finalStatus: ChatStatus = "success";
      try {
        while (aliveRef.current && pollTokenRef.current === token) {
          const snapshot = await fetchBookAgentTask(taskId, seq);
          // 拉取期间可能已卸载或已切换到新任务
          if (!aliveRef.current || pollTokenRef.current !== token) break;
          if (snapshot.events?.length) {
            handleEvents(
              snapshot.events.map((item) => ({
                event: item.type,
                data: item.data,
              })),
            );
          }
          seq = snapshot.nextSeq;
          // 仍在运行且暂无新事件：稍后再拉
          if (snapshot.status === "running") {
            await new Promise((resolve) => setTimeout(resolve, 600));
            continue;
          }
          if (snapshot.status === "error") finalStatus = "error";
          else if (snapshot.status === "cancelled") finalStatus = "abort";
          break;
        }
      } catch (error: any) {
        finalStatus = "error";
        appendToMessage(
          ensureActive(),
          `\n\n[错误] ${error?.message || String(error)}`,
        );
      } finally {
        // 组件已卸载：保留 localStorage 标记，返回页面后继续恢复
        if (!aliveRef.current) return;
        // 已被新的轮询接管：由新任务负责收尾
        if (pollTokenRef.current !== token) return;
        finishActive(finalStatus);
        setStreaming(false);
        setRequestId(null);
        if (taskIdRef.current === taskId) taskIdRef.current = null;
        activeKeyRef.current = null;
        clearActiveBookAgentTask(bookId);
        // 刷新章节列表，让 AI 新写的章节（isAi=1）立即可见
        try {
          await loadBookById(bookId);
          const state = useWriterStore.getState();
          const chapterId = state.currentChapter?.id;
          if (
            chapterId &&
            state.book.chapters.some((chapter) => chapter.id === chapterId)
          ) {
            await state.setCurrentChapter(chapterId);
          }
        } catch (error) {
          console.error("刷新章节列表失败:", error);
        }
      }
    },
    [appendToMessage, ensureActive, finishActive, handleEvents, loadBookById],
  );

  // 历史加载完成后检查是否有进行中的后台任务：
  // 切页 / 刷新返回时凭 taskId 重放事件，恢复正在生成的回答。
  useEffect(() => {
    const bookId = historyLoadedBookId;
    if (!bookId || taskIdRef.current) return;
    let cancelled = false;
    let polling = false;
    (async () => {
      let taskId = getSavedBookAgentTask(bookId);
      if (!taskId) {
        try {
          taskId = await getActiveBookAgentTask(bookId);
        } catch (error) {
          console.error("查询进行中的写书任务失败:", error);
          return;
        }
      }
      if (cancelled || !taskId) return;
      let running = false;
      try {
        // 先探测一次状态：已结束的任务内容已落库，无需重放
        const snapshot = await fetchBookAgentTask(taskId, 0, 1);
        if (cancelled) return;
        running = snapshot.status === "running";
      } catch {
        // 任务不存在（如后端重启）：按已结束处理
        running = false;
      }
      if (!running) {
        // 任务已结束或已不存在：清除标记并重新加载历史，
        // 把期间完成的记录（含残留 running 状态的旧记录）展示出来
        clearActiveBookAgentTask(bookId);
        try {
          await loadHistory(bookId, true);
        } catch (error) {
          console.error("重新加载 AI 写书历史失败:", error);
        }
        return;
      }
      polling = true;
      await runTask(taskId, bookId);
    })();
    return () => {
      cancelled = true;
      // 切换书籍时停止上一本书的恢复轮询
      if (polling) pollTokenRef.current += 1;
    };
  }, [historyLoadedBookId, loadHistory, runTask]);

  const handleSend = useCallback(
    async (input?: string) => {
      const text = (input ?? prompt).trim();
      if (!text || streaming) return;

      const bookId = useWriterStore.getState().book?.id;
      if (!bookId) {
        antdMessage.warning("请先打开一本书");
        return;
      }

      // 复用「APIKey管理」中选择的模型与密钥
      const aiKeys = (getLocalStore<AIKey[]>("model")?.value || []) as AIKey[];
      const selected = getLocalStore<string>("selectedAI")?.value || "";
      const chosen = aiKeys.find((item) => item.model === selected) || aiKeys[0];
      if (!chosen?.model || !chosen.key) {
        antdMessage.warning("请先在「APIKey管理」中配置模型密钥");
        return;
      }
      const config = resolveModelConfig(chosen.model);

      const newRequestId = `book-agent-${Date.now()}`;
      setRequestId(newRequestId);
      setPrompt("");
      setStreaming(true);
      activeKeyRef.current = null;
      activeRunKeyRef.current = newRequestId;
      pushMessage({
        key: `u-${newRequestId}`,
        role: "user",
        content: text,
        status: "success",
        // 与本次运行的 Agent 步骤共享 runKey，删除时整段一起移除
        runKey: newRequestId,
      });

      // 后台任务模式：先在服务端启动任务（任务 id 即 requestId），
      // 再凭 taskId 轮询事件；切页 / 刷新不影响任务继续运行。
      taskIdRef.current = newRequestId;
      saveActiveBookAgentTask(bookId, newRequestId);

      try {
        const started = await startBookAgentTask({
          prompt: text,
          bookId,
          model: config.model,
          baseUrl: config.url,
          apiKey: chosen.key,
          requestId: newRequestId,
        });
        const taskId = started?.taskId || newRequestId;
        // runTask 内部完成轮询、终态收尾与章节列表刷新
        await runTask(taskId, bookId);
      } catch (error: any) {
        console.error("AI 写书请求失败:", error);
        appendToMessage(
          ensureActive(),
          `\n\n[错误] ${error?.message || String(error)}`,
        );
        finishActive("error");
        setStreaming(false);
        setRequestId(null);
        taskIdRef.current = null;
        activeKeyRef.current = null;
        clearActiveBookAgentTask(bookId);
      }

      /* ===== 原实现（同步 SSE，已由后台任务 + 轮询替代，保留备查） =====
      const abortController = new AbortController();
      abortRef.current = abortController;
      try {
        // 端口由后端动态分配，统一通过 getApiUrl 拼接
        const response = await fetch(getApiUrl("/api/book-agent"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            prompt: text,
            bookId,
            model: config.model,
            baseUrl: config.url,
            apiKey: chosen.key,
            requestId: newRequestId,
          }),
          signal: abortController.signal,
        });
        if (!response.body) throw new Error("响应体为空");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEBuffer(sseBuffer);
          sseBuffer = remaining;
          if (events.length > 0) handleEvents(events);
        }
        finishActive("success");
      } catch (error: any) {
        if (error?.name === "AbortError") {
          appendToMessage(ensureActive(), "\n\n[任务已取消]");
          finishActive("abort");
        } else {
          console.error("AI 写书请求失败:", error);
          appendToMessage(
            ensureActive(),
            `\n\n[错误] ${error?.message || String(error)}`,
          );
          finishActive("error");
        }
      } finally {
        setStreaming(false);
        setRequestId(null);
        abortRef.current = null;
        activeKeyRef.current = null;
        // 刷新章节列表，让 AI 新写的章节（isAi=1）立即可见
        await loadBookById(bookId);
        const state = useWriterStore.getState();
        const chapterId = state.currentChapter?.id;
        if (
          chapterId &&
          state.book.chapters.some((chapter) => chapter.id === chapterId)
        ) {
          await state.setCurrentChapter(chapterId);
        }
      }
      ===== 原实现结束 ===== */
    },
    [
      prompt,
      streaming,
      pushMessage,
      appendToMessage,
      ensureActive,
      finishActive,
      runTask,
    ],
  );

  const handleCancel = useCallback(() => {
    // 取消后台任务：服务端会推送 cancel 事件，前端轮询随之收尾
    const taskId = taskIdRef.current || requestId;
    if (taskId) {
      cancelBookAgentTask(taskId).catch(() => undefined);
    }
    // 原实现：直接中止 SSE 连接
    // if (requestId) {
    //   fetch(getApiUrl(`/api/chat-cancel?requestId=${requestId}`), {
    //     headers: getAuthHeaders(),
    //   }).catch(() => undefined);
    // }
    // abortRef.current?.abort();
  }, [requestId]);

  /** 删除一段对话：用户提问 + 同一次运行的全部 Agent 步骤，含后端记录。 */
  const deleteRun = useCallback(
    (runKey: string) => {
      const runMessages = messagesRef.current.filter((m) => m.runKey === runKey);
      if (runMessages.length === 0) return;
      const preview = (runMessages.find((m) => m.role === "user")?.content || "")
        .replace(/\s+/g, " ")
        .trim();
      modal.confirm({
        title: "删除对话",
        content: preview
          ? `确定删除「${preview.length > 30 ? `${preview.slice(0, 30)}…` : preview}」及其 AI 回复吗？删除后不可恢复。`
          : "确定删除这段对话及其 AI 回复吗？删除后不可恢复。",
        okText: "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: async () => {
          // 实时段的 runKey 是请求 id，需要经 user_message 事件下发的
          // recordId 映射到后端记录；历史段的 runKey 本身就是记录 id
          const recordId =
            runRecordMapRef.current.get(runKey) ||
            (knownRecordIdsRef.current.has(runKey) ? runKey : null);
          if (recordId) {
            try {
              await deleteBookAgent(recordId);
              knownRecordIdsRef.current.delete(recordId);
              runRecordMapRef.current.delete(runKey);
            } catch (error) {
              console.error("删除对话记录失败:", error);
              antdMessage.error("删除失败，请稍后重试");
              return;
            }
          }
          const removedKeys = new Set(runMessages.map((m) => m.key));
          messagesRef.current = messagesRef.current.filter(
            (m) => m.runKey !== runKey,
          );
          // 同步清理这些消息在思考链中的展开/收起状态
          setCollapsedKeys((prev) => {
            const next = new Set(prev);
            removedKeys.forEach((key) => next.delete(key));
            return next;
          });
          syncMessages();
        },
      });
    },
    [modal, syncMessages],
  );

  // 用户提问用气泡，同一次运行内的多个 Agent 步骤用 ThoughtChain 串联
  const blocks = groupMessages(messages);

  const toggleBlockExpand = useCallback(
    (steps: ChatMessage[], expandedKeys: string[]) => {
      const expanded = new Set(expandedKeys);
      setCollapsedKeys((prev) => {
        const next = new Set(prev);
        for (const step of steps) {
          if (expanded.has(step.key)) {
            next.delete(step.key);
          } else {
            next.add(step.key);
          }
        }
        return next;
      });
    },
    [],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {modalContextHolder}
      <div className="flex items-center gap-2 border-b border-theme-light px-4 py-2.5 shrink-0">
        <Button
          type="text"
          size="small"
          icon={leftVisible ? <LeftOutlined /> : <RightOutlined />}
          title={leftVisible ? "收起左侧章节预览" : "展开左侧章节预览"}
          disabled={!currentChapter}
          onClick={onToggleLeft}
        />
        <span className="text-sm font-semibold text-theme-primary">AI写书</span>
        <div className="flex-1" />
        {onClose && (
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
          >
            退出
          </Button>
        )}
      </div>

      {messages.length > 0 ? (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-3"
        >
          {blocks.map((block) =>
            block.kind === "user" ? (
              <div key={block.key} className="flex justify-end">
                <Bubble
                  variant="filled"
                  content={
                    <div className="text-sm">
                      <XMarkdown content={block.content} />
                    </div>
                  }
                />
              </div>
            ) : (
              <div key={block.key} className="group">
                <ThoughtChain
                  line="dashed"
                  expandedKeys={block.steps
                    .filter((step) => !collapsedKeys.has(step.key))
                    .map((step) => step.key)}
                  onExpand={(keys) => toggleBlockExpand(block.steps, keys)}
                  items={block.steps.map((step) => ({
                    key: step.key,
                    // 每个节点都可单独收起/展开
                    collapsible: true,
                    title: agentLabel(step.agent),
                    description:
                      step.status === "loading"
                        ? "进行中…"
                        : step.status === "error"
                          ? "异常终止"
                          : step.status === "abort"
                            ? "已取消"
                            : undefined,
                    status:
                      step.status === "loading"
                        ? "loading"
                        : step.status === "error"
                          ? "error"
                          : step.status === "abort"
                            ? "abort"
                            : "success",
                    blink: step.status === "loading",
                    // 节点内容 = 思考过程 + 本次发起的所有工具调用
                    content:
                      step.content || step.tools?.length ? (
                        <Flex gap="small" vertical>
                          {step.content && (
                            <Think title="思考过程">
                              <div className="text-sm">
                                <XMarkdown content={step.content} />
                              </div>
                            </Think>
                          )}
                          {step.tools?.map((tool) => (
                            <ThoughtChain.Item
                              key={tool.key}
                              variant="solid"
                              icon={<CodeOutlined />}
                              status={tool.status}
                              title={`工具：${tool.name}`}
                              // 结果已由后端加工为多行可读文本，用 pre-wrap 保留换行并隐藏内部 id
                              description={
                                tool.result ? (
                                  <div className="whitespace-pre-wrap text-xs">
                                    {clipToolResult(tool.result, 1000)}
                                  </div>
                                ) : (
                                  "执行中…"
                                )
                              }
                            />
                          ))}
                        </Flex>
                      ) : undefined,
                  }))}
                />
                {/* 删除入口放在 AI 回答下方，悬停显示：移除本段提问及对应的全部 Agent 步骤 */}
                {!(streaming && activeRunKeyRef.current === block.runKey) && (
                  <div className="mt-1">
                    <Button
                      type="text"
                      size="small"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      icon={<DeleteOutlined />}
                      title="删除这段对话"
                      aria-label="删除这段对话"
                      onClick={() => deleteRun(block.runKey)}
                    >
                      删除这段对话
                    </Button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-theme-muted">
          描述你的写书需求，AI 会自动规划章纲、分配角色并撰写正文
        </div>
      )}

      <div className="border-t border-theme-light px-4 py-3 shrink-0">
        <Sender
          value={prompt}
          onChange={setPrompt}
          onSubmit={(text) => {
            void handleSend(text);
          }}
          loading={streaming}
          onCancel={handleCancel}
          placeholder="描述你的写书需求，例如：帮我写一本科幻小说..."
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </div>
    </div>
  );
}
