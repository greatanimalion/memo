import React, { useState, useRef, useEffect, useCallback } from "react";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { Button, Input, Modal } from "antd";
import {
  SendOutlined,
  StopOutlined,
  BorderOuterOutlined,
  BulbOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ReconciliationOutlined,
} from "@ant-design/icons";
import { port } from "@renderer/constants";

const { TextArea } = Input;

interface BookAgentModalProps {
  open: boolean;
  onClose: () => void;
}

interface AgentState {
  id: string;
  title: string;
  role: string;
  icon: React.ReactNode;
  content: string;
  status: "idle" | "running" | "done";
}

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
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [agent.content]);

  return (
    <div
      className={`flex flex-col h-full rounded-xl border border-theme-light overflow-hidden ${statusColor}`}
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
      </div>
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
    </div>
  );
});

AgentPanel.displayName = "AgentPanel";

function createEmptyAgent(id: string): AgentState {
  const meta = AGENT_META[id];
  return { id, ...meta, content: "", status: "idle" };
}

const BookAgentModal: React.FC<BookAgentModalProps> = ({ open, onClose }) => {
  const book = useWriterStore((s) => s.book);
  const loadBookById = useWriterStore((s) => s.loadBookById);
  const [prompt, setPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [agents, setAgents] = useState<AgentState[]>([]);
  const agentsRef = useRef<Map<string, AgentState>>(new Map());

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
      agentsRef.current.clear();
      setAgents([]);
      setPrompt("");
      setIsStreaming(false);
    }
  }, [open]);

  const syncAgentsFromRef = useCallback(() => {
    setAgents(Array.from(agentsRef.current.values()));
  }, []);

  const appendToAgent = useCallback(
    (agentId: string, text: string) => {
      if (!agentsRef.current.has(agentId)) {
        agentsRef.current.set(agentId, createEmptyAgent(agentId));
      }
      const agent = agentsRef.current.get(agentId)!;
      agent.content += text;
      agent.status = "running";
      syncAgentsFromRef();
    },
    [syncAgentsFromRef],
  );

  const parseStreamIncremental = useCallback(
    (buffer: string, prevLen: number) => {
      const newPart = buffer.substring(prevLen);
      if (!newPart) return;

      const sectionRegex =
        /### \[(orchestrator|thinker|writer|editor|consistency|system)\]\n\n/g;
      let lastEnd = 0;
      let match: RegExpExecArray | null;
      const matches: { agentId: string; start: number }[] = [];

      sectionRegex.lastIndex = 0;
      while ((match = sectionRegex.exec(newPart)) !== null) {
        const agentId = match[1] === "system" ? "orchestrator" : match[1];
        matches.push({ agentId, start: match.index + match[0].length });
      }

      if (matches.length === 0) {
        const currentAgent =
          agentsRef.current.size > 0
            ? Array.from(agentsRef.current.values()).find(
                (a) => a.status === "running",
              )
            : null;
        if (currentAgent) {
          currentAgent.content += newPart;
          syncAgentsFromRef();
        }
        return;
      }

      for (let i = 0; i < matches.length; i++) {
        const { agentId, start } = matches[i];
        const end =
          i + 1 < matches.length
            ? newPart.indexOf("### [", start)
            : newPart.length;
        const content = newPart.substring(
          start,
          end === -1 ? newPart.length : end,
        );

        if (!agentsRef.current.has(agentId)) {
          agentsRef.current.set(agentId, createEmptyAgent(agentId));
        }
        const agent = agentsRef.current.get(agentId)!;
        agent.content += content;
        agent.status = "running";
      }

      const toolRegex =
        /\[(orchestrator|thinker|writer|editor|consistency):(\w+)\]/g;
      let tm: RegExpExecArray | null;
      while ((tm = toolRegex.exec(newPart)) !== null) {
        const agentId = tm[1];
        if (!agentsRef.current.has(agentId)) {
          const agent = createEmptyAgent(agentId);
          agent.status = "running";
          agent.content = `调用工具: ${tm[2]}`;
          agentsRef.current.set(agentId, agent);
        }
      }

      syncAgentsFromRef();
    },
    [syncAgentsFromRef],
  );

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || !book.id) return;

    const userMessage = prompt.trim();
    const newRequestId = `book-agent-${Date.now()}`;
    setRequestId(newRequestId);
    setPrompt("");
    setIsStreaming(true);

    agentsRef.current.clear();
    const starter = createEmptyAgent("orchestrator");
    starter.content = "正在启动...";
    starter.status = "running";
    agentsRef.current.set("orchestrator", starter);
    syncAgentsFromRef();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`http://localhost:${port}/api/book-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          bookId: book.id,
          model: "deepseek-v4-flash",
          apiKey: "sk-108afdf674fc46838cb861e35350da71",
          requestId: newRequestId,
        }),
        signal: abortController.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let prevLen = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        parseStreamIncremental(buffer, prevLen);
        prevLen = buffer.length;
      }

      parseStreamIncremental(buffer, prevLen);

      if (buffer.includes("[book-agent:done]")) {
        agentsRef.current.forEach((agent) => {
          agent.status = "done";
        });
        syncAgentsFromRef();
        loadBookById(book.id);
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        const agent = agentsRef.current.get("orchestrator");
        if (agent) {
          agent.content += "\n\n[任务已取消]";
          agent.status = "done";
        }
        syncAgentsFromRef();
      } else {
        console.error("Book Agent error:", error);
        const agent = agentsRef.current.get("orchestrator");
        if (agent) {
          agent.content = `[错误] ${error.message}`;
          agent.status = "done";
        }
        syncAgentsFromRef();
      }
    } finally {
      setIsStreaming(false);
      setRequestId(null);
      abortControllerRef.current = null;
    }
  }, [
    prompt,
    book.id,
    loadBookById,
    syncAgentsFromRef,
    parseStreamIncremental,
  ]);

  const handleCancel = useCallback(() => {
    if (requestId) {
      fetch(`http://localhost:${port}/api/chat-cancel?requestId=${requestId}`);
    }
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, [requestId]);

  const renderAgentGrid = () => {
    if (agents.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
          输入需求开始创作
        </div>
      );
    }

    return (
      <div className="flex-1 flex gap-2 p-2 min-h-0">
        {agents.map((agent) => (
          <div key={agent.id} className="flex-1 min-w-0 h-full">
            <AgentPanel agent={agent} />
          </div>
        ))}
      </div>
    );
  };

  const modalW = Math.round(windowSize.w * 0.8);
  const modalH = Math.round(windowSize.h * 0.8);

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
          {agents.length > 0 && (
            <span className="text-xs text-theme-muted ml-2">
              ({agents.filter((a) => a.status === "done").length}/
              {agents.length} 完成)
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {renderAgentGrid()}

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
