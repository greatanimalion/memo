import React, { useState, useRef, useEffect, useCallback } from "react";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { Button, Input, Modal, message } from "antd";
import {
  SendOutlined,
  StopOutlined,
  BorderOuterOutlined,
  BulbOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ReconciliationOutlined,
  UpOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { port } from "@renderer/constants";
import { AIKey } from "@renderer/types/common";
import { getLocalStore } from "@renderer/utils/localStore";
import { resolveModelConfig } from "@renderer/utils/helper";
import { getBookAgentsByBookId } from "@renderer/services/bookAgent";

const { TextArea } = Input;

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEBuffer(
  buffer: string,
): { events: SSEEvent[]; remaining: string } {
  const events: SSEEvent[] = [];
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() || "";
  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }
    events.push({ event, data });
  }
  return { events, remaining };
}

interface BookAgentModalProps {
  open: boolean;
  onClose: () => void;
}

type TurnStatus = "running" | "done" | "error" | "cancelled";

interface AgentState {
  id: string;
  title: string;
  role: string;
  icon: React.ReactNode;
  content: string;
  status: "idle" | "running" | "done";
}

interface Turn {
  key: string;
  title: string;
  agents: AgentState[];
  status: TurnStatus;
}

let turnKeySeq = 0;
function nextTurnKey() {
  turnKeySeq += 1;
  return `turn-${turnKeySeq}`;
}

const TURN_STATUS_META: Record<
  TurnStatus,
  { label: string; className: string }
> = {
  running: {
    label: "进行中",
    className: "bg-accent-light/40 text-accent",
  },
  done: {
    label: "成功",
    className: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
  error: {
    label: "失败",
    className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
  cancelled: {
    label: "用户取消",
    className: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

const AGENT_META: Record<
  string,
  { title: string; role: string; icon: React.ReactNode }
> = {
  orchestrator: {
    title: "Orchestrator",
    role: "总控/规划 — 调度其他 Agent，质量把关",
    icon: <BorderOuterOutlined />,
  },
  thinker: {
    title: "Thinker",
    role: "构思/规划 — 大纲生成，结构设计",
    icon: <BulbOutlined />,
  },
  writer: {
    title: "Writer",
    role: "写作 — 撰写章节正文",
    icon: <EditOutlined />,
  },
  editor: {
    title: "Editor",
    role: "编辑/审校 — 润色优化，节奏把控",
    icon: <ReconciliationOutlined />,
  },
  consistency: {
    title: "Consistency",
    role: "一致性检查 — 防止设定矛盾",
    icon: <CheckCircleOutlined />,
  },
};

const AgentPanel: React.FC<{ agent: AgentState }> = React.memo(({ agent }) => {
  const [collapsed, setCollapsed] = useState(false);

  const statusColor = {
    idle: "bg-theme-secondary/50",
    running: "bg-accent-light/30",
    done: "bg-green-50 dark:bg-green-900/20",
  }[agent.status];

  const statusDot = {
    idle: "bg-theme-muted",
    running: "bg-accent animate-pulse",
    done: "bg-green-500",
  }[agent.status];

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [agent.content, collapsed]);

  return (
    <div
      className={`flex flex-col flex-1 min-w-0 rounded-xl border border-theme-light overflow-hidden ${statusColor} ${
        collapsed ? "" : "h-96"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-light bg-theme-primary/50 shrink-0">
        <span className={`w-2 h-2 rounded-full ${statusDot}`} />
        <span className="text-accent">{agent.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-theme-primary truncate">
            {agent.title}
          </div>
          <div className="text-[10px] text-theme-muted truncate">
            {agent.role}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "展开" : "收起"}
          className="cursor-pointer shrink-0 flex items-center justify-center w-5 h-5 rounded text-theme-muted hover:text-accent hover:bg-theme-secondary/60 transition-colors"
        >
          {collapsed ? <DownOutlined /> : <UpOutlined />}
        </button>
      </div>
      {!collapsed && (
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-3 py-2 text-xs text-theme-secondary whitespace-pre-wrap min-h-0"
        >
          {agent.content ? (
            <>
              {agent.content}
              {agent.status === "running" && (
                <span className="inline-block w-1.5 h-3 bg-accent ml-0.5 animate-pulse align-text-bottom" />
              )}
            </>
          ) : (
            <span className="text-theme-muted italic">等待中...</span>
          )}
        </div>
      )}
    </div>
  );
});

AgentPanel.displayName = "AgentPanel";

function createEmptyAgent(id: string): AgentState {
  const meta = AGENT_META[id] || AGENT_META.orchestrator;
  return { id, ...meta, content: "", status: "idle" };
}

const BookAgentModal: React.FC<BookAgentModalProps> = ({ open, onClose }) => {
  const book = useWriterStore((s) => s.book);
  const loadBookById = useWriterStore((s) => s.loadBookById);
  const [prompt, setPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  const currentTurnKeyRef = useRef<string | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () =>
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) {
      turnsRef.current = [];
      currentTurnKeyRef.current = null;
      currentAgentIdRef.current = null;
      setTurns([]);
      setPrompt("");
      setIsStreaming(false);
    }
  }, [open]);

  const syncTurnsFromRef = useCallback(() => {
    setTurns([...turnsRef.current]);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // 打开弹窗时加载该书籍的历史问答（每条记录 = 一轮问答）
  useEffect(() => {
    if (!open || !book?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getBookAgentsByBookId(book.id);
        if (cancelled) return;
        // 后端按 createdAt DESC 返回，转为正序
        const ordered = [...(list || [])].reverse();
        const next: Turn[] = ordered.map((record) => {
          const agents: AgentState[] = [];
          const byId = new Map<string, AgentState>();
          for (const msg of record.messages || []) {
            const agentId =
              msg.agent && AGENT_META[msg.agent] ? msg.agent : "orchestrator";
            let agent = byId.get(agentId);
            if (!agent) {
              agent = { ...createEmptyAgent(agentId), status: "done" };
              byId.set(agentId, agent);
              agents.push(agent);
            }
            agent.content +=
              msg.role === "tool" ? `\n${msg.content}\n` : `\n\n${msg.content}`;
          }
          return {
            key: nextTurnKey(),
            title: record.title || "",
            agents,
            status: (record.status as TurnStatus) || "done",
          };
        });
        turnsRef.current = next;
        currentTurnKeyRef.current = next.length
          ? next[next.length - 1].key
          : null;
        currentAgentIdRef.current = null;
        syncTurnsFromRef();
        scrollToBottom();
      } catch (e) {
        console.error("加载书籍对话历史失败:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, book?.id, syncTurnsFromRef, scrollToBottom]);

  const startTurn = useCallback(
    (title: string) => {
      const turn: Turn = {
        key: nextTurnKey(),
        title,
        agents: [],
        status: "running",
      };
      currentTurnKeyRef.current = turn.key;
      currentAgentIdRef.current = null;
      turnsRef.current = [...turnsRef.current, turn];
      syncTurnsFromRef();
      scrollToBottom();
      return turn.key;
    },
    [syncTurnsFromRef, scrollToBottom],
  );

  const ensureAgent = useCallback(
    (agentId: string) => {
      const turnKey = currentTurnKeyRef.current;
      if (!turnKey) return;
      currentAgentIdRef.current = agentId;
      turnsRef.current = turnsRef.current.map((t) => {
        if (t.key !== turnKey) return t;
        if (t.agents.some((a) => a.id === agentId)) {
          return {
            ...t,
            agents: t.agents.map((a) =>
              a.id === agentId ? { ...a, status: "running" } : a,
            ),
          };
        }
        return {
          ...t,
          agents: [
            ...t.agents,
            { ...createEmptyAgent(agentId), status: "running" },
          ],
        };
      });
      syncTurnsFromRef();
      scrollToBottom();
    },
    [syncTurnsFromRef, scrollToBottom],
  );

  const appendToCurrentAgent = useCallback(
    (text: string) => {
      const turnKey = currentTurnKeyRef.current;
      const agentId = currentAgentIdRef.current;
      if (!turnKey || !agentId) return;
      turnsRef.current = turnsRef.current.map((t) =>
        t.key === turnKey
          ? {
              ...t,
              agents: t.agents.map((a) =>
                a.id === agentId
                  ? { ...a, content: a.content + text, status: "running" }
                  : a,
              ),
            }
          : t,
      );
      syncTurnsFromRef();
      scrollToBottom();
    },
    [syncTurnsFromRef, scrollToBottom],
  );

  const setCurrentTurnStatus = useCallback(
    (status: TurnStatus) => {
      const turnKey = currentTurnKeyRef.current;
      if (!turnKey) return;
      turnsRef.current = turnsRef.current.map((t) =>
        t.key === turnKey
          ? {
              ...t,
              status,
              agents: t.agents.map((a) =>
                a.status === "running" ? { ...a, status: "done" } : a,
              ),
            }
          : t,
      );
      syncTurnsFromRef();
    },
    [syncTurnsFromRef],
  );

  const parseStreamIncremental = useCallback(
    (newEvents: SSEEvent[]) => {
      for (const { event, data } of newEvents) {
        switch (event) {
          case "agent": {
            try {
              const { name } = JSON.parse(data);
              if (AGENT_META[name]) {
                ensureAgent(name);
              }
            } catch {}
            break;
          }
          case "message": {
            appendToCurrentAgent(data);
            break;
          }
          case "tool_call": {
            try {
              const { name } = JSON.parse(data);
              appendToCurrentAgent(`\n调用工具: ${name}\n`);
            } catch {}
            break;
          }
          case "tool": {
            try {
              const { name, result } = JSON.parse(data);
              appendToCurrentAgent(`\n[${name}] ${result}\n`);
            } catch {}
            break;
          }
          case "error": {
            appendToCurrentAgent(`\n[错误] ${data}`);
            setCurrentTurnStatus("error");
            break;
          }
          case "cancel": {
            appendToCurrentAgent("\n\n[任务已取消]");
            setCurrentTurnStatus("cancelled");
            break;
          }
          case "done": {
            setCurrentTurnStatus("done");
            break;
          }
        }
      }
    },
    [
      ensureAgent,
      appendToCurrentAgent,
      setCurrentTurnStatus,
    ],
  );

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || !book.id) return;

    // 使用用户在「APIKey管理」里配置的模型与密钥
    const aiKeys = (getLocalStore<AIKey[]>("model")?.value || []) as AIKey[];
    const selected = getLocalStore<string>("selectedAI")?.value || "";
    const chosen = aiKeys.find((item) => item.model === selected) || aiKeys[0];
    if (!chosen?.model || !chosen?.key) {
      message.warning("请先在「APIKey管理」中配置模型密钥");
      return;
    }
    const config = resolveModelConfig(chosen.model);

    const userMessage = prompt.trim();
    const newRequestId = `book-agent-${Date.now()}`;
    setRequestId(newRequestId);
    setPrompt("");
    setIsStreaming(true);

    startTurn(userMessage);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`http://localhost:${port}/api/book-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          bookId: book.id,
          model: config.model,
          baseUrl: config.url,
          apiKey: chosen.key,
          requestId: newRequestId,
        }),
        signal: abortController.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEBuffer(sseBuffer);
        sseBuffer = remaining;

        if (events.length > 0) {
          parseStreamIncremental(events);
        }
      }

      setCurrentTurnStatus("done");
    } catch (error: any) {
      if (error.name === "AbortError") {
        appendToCurrentAgent("\n\n[任务已取消]");
        setCurrentTurnStatus("cancelled");
      } else {
        console.error("Book Agent error:", error);
        appendToCurrentAgent(`\n[错误] ${error.message}`);
        setCurrentTurnStatus("error");
      }
    } finally {
      setIsStreaming(false);
      setRequestId(null);
      abortControllerRef.current = null;
      if (book.id) {
        loadBookById(book.id);
      }
    }
  }, [
    prompt,
    book.id,
    loadBookById,
    startTurn,
    setCurrentTurnStatus,
    appendToCurrentAgent,
    parseStreamIncremental,
  ]);

  const handleCancel = useCallback(() => {
    if (requestId) {
      fetch(`http://localhost:${port}/api/chat-cancel?requestId=${requestId}`);
    }
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, [requestId]);

  const renderChat = () => {
    if (turns.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
          输入需求开始创作
        </div>
      );
    }

    return (
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 min-h-0 space-y-5"
      >
        {turns.map((turn) => {
          const statusMeta = TURN_STATUS_META[turn.status];
          return (
            <div key={turn.key} className="space-y-2">
              {/* 用户输入：右侧 */}
              <div className="flex items-center justify-end gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.className}`}
                >
                  {statusMeta.label}
                </span>
                <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-xs text-white whitespace-pre-wrap wrap-break-word shadow-sm">
                  {turn.title}
                </div>
              </div>
              {/* AI 回答：横向捆绑布局 */}
              {turn.agents.length > 0 && (
                <div className="flex gap-2 items-start">
                  {turn.agents.map((agent) => (
                    <AgentPanel key={agent.id} agent={agent} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const modalW = Math.round(windowSize.w * 0.8);
  const modalH = Math.round(windowSize.h * 0.7);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={modalW}
      className="book-agent-modal"
      styles={{
        body: {
          height: modalH,
          display: "flex",
          flexDirection: "column",
          padding: 0,
        },
      }}
      title={
        <div className="flex items-center gap-2">
          <BorderOuterOutlined className="text-accent" />
          <span>AI 写书工作台</span>
          {turns.length > 0 && (
            <span className="text-xs text-theme-muted ml-2">
              ({turns.length} 轮)
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {renderChat()}

        <div className="px-4 py-3 border-t border-theme-light shrink-0">
          <div className="flex gap-2">
            <TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你的写书需求，例如：帮我写一本科幻小说..."
              autoSize={{ minRows: 2, maxRows: 4 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isStreaming}
              className="text-xs"
            />
            {isStreaming ? (
              <Button
                type="primary"
                danger
                icon={<StopOutlined />}
                onClick={handleCancel}
                className="self-end"
              />
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                className="self-end"
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BookAgentModal;
