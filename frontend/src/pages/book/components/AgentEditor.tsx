
// 现实现：左侧章节预览（可切换 diff），右侧基于 ant-design/x 的 AI 写书对话。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble, Sender, ThoughtChain } from "@ant-design/x";
import { XMarkdown } from "@ant-design/x-markdown";
import { Button, Segmented, message as antdMessage } from "antd";
import {
  BorderOuterOutlined,
  CheckOutlined,
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
// 对比视图改用 react-diff-view：先用 diff 生成 unified diff，再解析成 hunks 渲染
import {
  parseDiff,
  Diff,
  Hunk,
  tokenize,
  markEdits,
} from "react-diff-view";
import "react-diff-view/style/index.css";
import { createTwoFilesPatch } from "diff";
// import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { getBookAgentsByBookId } from "@renderer/services/bookAgent";
import { mergeChapterAI } from "@renderer/services/book";
import { parseSSEBuffer } from "@renderer/utils/sse";
import type { SSEEvent } from "@renderer/utils/sse";
import { port } from "@renderer/constants";
import type { AIKey } from "@renderer/types/common";
import type { BookAgent } from "@type/book";
import { getLocalStore } from "@renderer/utils/localStore";
import { resolveModelConfig } from "@renderer/utils/helper";

interface AgentEditorProps {
  /** 返回普通编辑器（由 book.tsx 控制 AgentEditor / ManusEditor 的切换） */
  onClose?: () => void;
}

type ChatRole = "user" | "ai";
type ChatStatus = "local" | "loading" | "updating" | "success" | "error" | "abort";

interface ChatMessage {
  key: string;
  role: ChatRole;
  content: string;
  /** 产生该段内容的 Agent 名称，用于思考链节点标题 */
  agent?: string;
  status?: ChatStatus;
  /** 同一次请求/同一条历史记录的标识，用于把多个 Agent 串成一条思考链 */
  runKey?: string;
}

type ChatBlock =
  | { kind: "user"; key: string; content: string }
  | { kind: "thought"; key: string; runKey: string; steps: ChatMessage[] };

/** 把消息按「用户提问 + 一次运行内的多 Agent 步骤」切分成渲染块。 */
function groupMessages(messages: ChatMessage[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      blocks.push({ kind: "user", key: msg.key, content: msg.content });
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

/** 深色主题判断，与 AntDesignThemeProvider 保持一致。 */
function isDarkTheme(): boolean {
  const darkThemes = [
    "theme-classic-black",
    "theme-modern-dark",
    "theme-deep-blue",
    "theme-premium-gray",
  ];
  return darkThemes.some((cls) => document.body.classList.contains(cls));
}

/** 工具结果可能很长（如整章正文），展示时截断，避免撑爆气泡。 */
function clipToolResult(result: unknown, max = 1200): string {
  const text =
    typeof result === "string" ? result : JSON.stringify(result ?? "");
  if (!text) return "（无返回内容）";
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
}

/** 把后端保存的历史问答转换为聊天气泡：每条记录 = 一问多答。 */
function buildHistory(records: BookAgent[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  // 后端按 createdAt DESC 返回，转为正序
  for (const record of [...records].reverse()) {
    out.push({
      key: `h-u-${record.id}`,
      role: "user",
      content: record.title || "（历史任务）",
      status: "success",
    });
    const grouped = new Map<string, string>();
    for (const msg of record.messages || []) {
      const agent = msg.agent || "orchestrator";
      const prev = grouped.get(agent) || "";
      const text = msg.role === "tool" ? `\n${msg.content}\n` : `\n\n${msg.content}`;
      grouped.set(agent, prev + text);
    }
    for (const [agent, content] of grouped) {
      out.push({
        key: `h-a-${record.id}-${agent}`,
        role: "ai",
        agent,
        content: content.trim(),
        status: "success",
        runKey: record.id,
      });
    }
  }
  return out;
}

export function AgentEditor({ onClose }: AgentEditorProps) {
  const book = useWriterStore((s) => s.book);
  const currentChapter = useWriterStore((s) => s.currentChapter);
  const setCurrentChapter = useWriterStore((s) => s.setCurrentChapter);
  const loadBookById = useWriterStore((s) => s.loadBookById);

  const [viewMode, setViewMode] = useState<"text" | "diff">("text");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 左右两栏的显示状态：各自可通过另一侧头部的箭头收起/展开
  const [leftVisible, setLeftVisible] = useState(true);
  const [rightVisible, setRightVisible] = useState(true);
  // 思考链中用户手动收起的节点；默认全部展开，点击标题即可收起。
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  // 正在把 AI 正文合并到 content
  const [merging, setMerging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  const activeKeyRef = useRef<string | null>(null);
  // 当前运行标识：同一次请求内的 Agent 输出串成一条思考链
  const activeRunKeyRef = useRef("");
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 选中新章节时自动展开左侧预览
  useEffect(() => {
    if (currentChapter?.id) setLeftVisible(true);
  }, [currentChapter?.id]);

  // 新消息到达时滚到底部（流式输出时同样保持跟随）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ───────── 左右分栏拖拽 ─────────
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);

  // 组件卸载时移除拖拽监听，避免残留
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    resizeCleanupRef.current?.();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const min = 320;
      // 右侧至少保留 420px，左侧最多 720px
      const max = Math.max(min, Math.min(rect.width - 420, 720));
      setLeftWidth(Math.min(Math.max(ev.clientX - rect.left, min), max));
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  }, []);

  // 切换章节时重置为正文视图
  useEffect(() => {
    setViewMode("text");
  }, [currentChapter?.id]);

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

  // 打开书籍时加载历史问答
  useEffect(() => {
    if (!book?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getBookAgentsByBookId(book.id);
        if (cancelled) return;
        messagesRef.current = buildHistory(list || []);
        activeKeyRef.current = null;
        syncMessages();
      } catch (e) {
        console.error("加载 AI 写书历史失败:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book?.id, syncMessages]);

  // 组件卸载时中断仍在进行的请求
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

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

  const handleEvents = useCallback(
    (events: SSEEvent[]) => {
      for (const { event, data } of events) {
        switch (event) {
          case "agent": {
            try {
              const { name } = JSON.parse(data);
              if (name) startAgentMessage(name);
            } catch {
              // 忽略无法解析的 agent 事件
            }
            break;
          }
          case "message": {
            appendToMessage(ensureActive(), data);
            break;
          }
          case "tool_call": {
            try {
              const { name } = JSON.parse(data);
              if (name) appendToMessage(ensureActive(), `\n\n〔调用工具〕${name}`);
            } catch {
              // 忽略无法解析的工具事件
            }
            break;
          }
          case "tool": {
            try {
              const { name, result } = JSON.parse(data);
              // 展示后台工具的真实返回，便于确认 AI 读到了什么内容
              appendToMessage(
                ensureActive(),
                `\n\n〔工具 ${name || "unknown"} 返回〕\n${clipToolResult(result)}`,
              );
            } catch {
              // 无法解析时按原始文本展示
              appendToMessage(
                ensureActive(),
                `\n\n〔工具返回〕\n${clipToolResult(data)}`,
              );
            }
            break;
          }
          case "error": {
            appendToMessage(ensureActive(), `\n\n[错误] ${data}`);
            finishActive("error");
            break;
          }
          case "cancel": {
            appendToMessage(ensureActive(), "\n\n[任务已取消]");
            finishActive("abort");
            break;
          }
          case "done": {
            finishActive("success");
            break;
          }
          default:
            break;
        }
      }
    },
    [appendToMessage, ensureActive, finishActive, startAgentMessage],
  );

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
      });

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const response = await fetch(`http://localhost:${port}/api/book-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    },
    [
      prompt,
      streaming,
      pushMessage,
      appendToMessage,
      ensureActive,
      finishActive,
      handleEvents,
      loadBookById,
    ],
  );

  const handleCancel = useCallback(() => {
    if (requestId) {
      fetch(`http://localhost:${port}/api/chat-cancel?requestId=${requestId}`).catch(
        () => undefined,
      );
    }
    abortRef.current?.abort();
  }, [requestId]);

  const isAiChapter = currentChapter?.isAi === 1;
  // AI 章节的正文在 aiRes；人工章节的正文在 content
  const previewText = isAiChapter
    ? currentChapter?.aiRes || ""
    : currentChapter?.content || "";

  // 对比视图：content（原文）与 aiRes（AI 更改）的 unified diff 与词级高亮
  const diffData = useMemo(() => {
    if (viewMode !== "diff" || !currentChapter || currentChapter.isAi !== 1) {
      return { hunks: [], tokens: null };
    }
    // react-diff-view 的解析器要求 git 格式头部（diff --git ...），
    // 而 diff 包输出的是 "=====" 分隔行，这里替换掉再解析。
    const patch = createTwoFilesPatch(
      "a/content",
      "b/aiRes",
      currentChapter.content || "",
      currentChapter.aiRes || "",
      "",
      "",
      { context: 3 },
    ).replace(/^=+\n/, "diff --git a/content b/aiRes\n");
    const hunks = parseDiff(patch).flatMap((file) => file.hunks);
    const tokens = hunks.length
      ? tokenize(hunks, { enhancers: [markEdits(hunks, { type: "block" })] })
      : null;
    return { hunks, tokens };
  }, [viewMode, currentChapter?.content, currentChapter?.aiRes, currentChapter?.isAi]);

  // 确认合并：后端读取 aiRes 覆盖 content，并把 isAi 置为 0
  const handleMergeAI = useCallback(async () => {
    const chapterId = currentChapter?.id;
    if (!chapterId || merging) return;
    setMerging(true);
    try {
      await mergeChapterAI(chapterId);
      antdMessage.success("已将 AI 正文合并到 content");
      setViewMode("text");
      // 刷新书籍与当前章节，让 isAi/字数等状态同步更新
      await loadBookById(book.id);
      const state = useWriterStore.getState();
      if (state.currentChapter?.id === chapterId) {
        await state.setCurrentChapter(chapterId);
      }
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : "合并失败");
    } finally {
      setMerging(false);
    }
  }, [currentChapter?.id, merging, loadBookById, book.id]);

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
    <div ref={splitContainerRef} className="flex h-full w-full min-w-0">
      {/* ───────── 左侧：章节正文 / diff ───────── */}
      {currentChapter && leftVisible && (
        <aside
          style={
            !rightVisible
              ? { flex: 1, width: "auto", maxWidth: "none" }
              : leftWidth !== null
                ? { width: leftWidth }
                : undefined
          }
          className="flex h-full w-[45%] min-w-75 max-w-180 shrink-0 flex-col border-r border-theme-light bg-theme-primary/40"
        >
          <div className="flex items-center gap-2 border-b border-theme-light px-3 py-2.5 shrink-0">
            <FileTextOutlined className="text-accent shrink-0" />
            <span className="truncate text-sm font-semibold text-theme-primary">
              {currentChapter.title || "未命名章节"}
            </span>
            {isAiChapter && (
              <span className="shrink-0 rounded-full bg-accent-light px-2 py-0.5 text-[10px] text-accent">
                AI 生成
              </span>
            )}
            <div className="flex-1" />
            {isAiChapter && (
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                loading={merging}
                disabled={!currentChapter.aiRes}
                title="用 AI 正文覆盖 content，并标记为人工内容"
                onClick={() => void handleMergeAI()}
              >
                确认覆盖
              </Button>
            )}
            {isAiChapter && (
              <Segmented
                size="small"
                value={viewMode}
                onChange={(value) => setViewMode(value as "text" | "diff")}
                options={[
                  { label: "正文", value: "text" },
                  { label: "对比", value: "diff" },
                ]}
              />
            )}
            <Button
              type="text"
              size="small"
              icon={rightVisible ? <RightOutlined /> : <LeftOutlined />}
              title={rightVisible ? "收起右侧对话" : "展开右侧对话"}
              onClick={() => setRightVisible((value) => !value)}
            />
          </div>

          {viewMode === "diff" && isAiChapter ? (
            <div
              className={
                isDarkTheme() ? "diff-wrap diff-wrap-dark" : "diff-wrap"
              }
            >
              {diffData.hunks.length > 0 ? (
                <Diff
                  viewType="split"
                  diffType="modify"
                  hunks={diffData.hunks}
                  tokens={diffData.tokens}
                >
                  {(hunks) =>
                    hunks.map((hunk) => (
                      <Hunk key={hunk.content} hunk={hunk} />
                    ))
                  }
                </Diff>
              ) : (
                <div className="p-4 text-sm italic text-theme-muted">
                  两侧内容一致，暂无差异
                </div>
              )}
            </div>
          ) : (
            /* 原 react-diff-viewer-continued 实现（已替换为 react-diff-view）
            <div className="flex-1 min-h-0 overflow-auto p-2">
              <ReactDiffViewer
                oldValue={currentChapter.content || ""}
                newValue={currentChapter.aiRes || ""}
                splitView
                useDarkTheme={isDarkTheme()}
                compareMethod={DiffMethod.WORDS}
                leftTitle="原文"
                rightTitle="AI更改"
                hideLineNumbers
                disableWorker
              />
            </div>
            */
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {previewText ? (
                <div className="whitespace-pre-wrap wrap-break-word text-[13px] leading-7 text-theme-secondary">
                  {previewText}
                </div>
              ) : (
                <div className="text-sm italic text-theme-muted">暂无正文</div>
              )}
            </div>
          )}
        </aside>
      )}

      {/* 左右分栏拖拽条：拖动改变宽度，双击恢复默认 */}
      {currentChapter && leftVisible && rightVisible && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="拖动调整宽度，双击恢复默认"
          onMouseDown={startResize}
          onDoubleClick={() => setLeftWidth(null)}
          className="group relative h-full w-1.5 shrink-0 cursor-col-resize"
        >
          <div
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
            style={{ backgroundColor: "var(--border-light)" }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      )}

      {/* ───────── 右侧：AI 写书对话 ───────── */}
      {rightVisible && (
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-theme-light px-4 py-2.5 shrink-0">
          <Button
            type="text"
            size="small"
            icon={leftVisible ? <LeftOutlined /> : <RightOutlined />}
            title={leftVisible ? "收起左侧章节预览" : "展开左侧章节预览"}
            disabled={!currentChapter}
            onClick={() => setLeftVisible((value) => !value)}
          />
          <BorderOuterOutlined className="text-accent" />
          <span className="text-sm font-semibold text-theme-primary">AI 写书工作台</span>
          <span className="truncate text-xs text-theme-muted">{book.title}</span>
          <div className="flex-1" />
          {onClose && (
            <Button
              type="text"
              size="small"
              icon={<LeftOutlined />}
              onClick={onClose}
            >
              返回编辑器
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
                    shape="corner"
                    content={
                      <div className="text-sm">
                        <XMarkdown content={block.content} />
                      </div>
                    }
                  />
                </div>
              ) : (
                <ThoughtChain
                  key={block.key}
                  line="solid"
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
                    content: step.content ? (
                      <div className="text-sm">
                        <XMarkdown content={step.content} />
                      </div>
                    ) : undefined,
                  }))}
                />
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
      )}
    </div>
  );
}
