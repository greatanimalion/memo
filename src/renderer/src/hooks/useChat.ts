import { useState, useEffect, useCallback, useRef } from "react";
import { Session, MyAgent } from "../../../types";
import type { Message } from "../../../types/agents";
import {
  createSession,
  deleteSession,
  getAllSession,
  updateSession,
} from "../services/session";
import { generateUUID } from "../utils/helper";
import { getAllMyAgent } from "../services/agent";

export const useChat = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [agents, setAgents] = useState<MyAgent[]>([]);
  const [prompt, setPrompt] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化会话列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessions = await getAllSession();
      if (cancelled) return;
      setSessions(sessions);
      const id = sessions[0]?.id || "";
      setCurrentSessionId(id);
      setCurrentSession(sessions[0] || null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 初始化智能体列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const _agents = await getAllMyAgent();
      if (!cancelled) setAgents(_agents || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages, scrollToBottom]);

  // 创建新对话
  const handleNewSession = useCallback(async () => {
    const id = Date.now();
    const newSession: Session = {
      id: generateUUID(),
      title: "新对话",
      messages: [
        {
          role: "system",
          content: "你好！我是你的 AI 助手，有什么可以帮助你的吗？",
          timestamp: id,
        },
      ],
      lastUpdated: id,
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setCurrentSession(newSession);
    await createSession(newSession);
    return newSession;
  }, []);

  // 更新当前会话消息
  const pushSessionToCurrentSession = useCallback(
    (session: Session) => {
      if (!currentSession) return;
      if (session) {
        setCurrentSession(session);
        setSessions((prev) =>
          prev.map((conv) => (conv.id === currentSessionId ? session : conv)),
        );
      }
    },
    [currentSession, currentSessionId],
  );

  // 更新会话列表
  const updateSessionsList = useCallback(async () => {
    const _sessions = await getAllSession();
    setSessions(_sessions);
  }, []);

  // 选择会话
  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        setCurrentSessionId(sessionId);
        setCurrentSession(session);
      }
    },
    [sessions],
  );

  // 删除会话
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      let nextSession: Session | null = null;
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        if (currentSessionId === sessionId) {
          nextSession = filtered[0] || null;
        }
        return filtered;
      });
      if (currentSessionId === sessionId) {
        Promise.resolve().then(() => {
          setCurrentSession(nextSession);
          setCurrentSessionId(nextSession?.id || "");
        });
      }
    },
    [currentSessionId],
  );

  // 更新会话标题
  const updateSessionTitle = useCallback(
    async (sessionId: string, title: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        const updatedSession: Session = { ...session, title };
        await updateSession(updatedSession);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? updatedSession : s)),
        );
        if (currentSessionId === sessionId) {
          setCurrentSession(updatedSession);
        }
      }
    },
    [currentSessionId, sessions],
  );

  // 添加消息到当前会话
  const addMessage = useCallback(
    async (message: Message) => {
      if (!currentSession) return;

      const updatedMessages = [...currentSession.messages, message];
      const updatedSession: Session = {
        ...currentSession,
        messages: updatedMessages,
        lastUpdated: Date.now(),
      };

      setCurrentSession(updatedSession);
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? updatedSession : s)),
      );

      await updateSession(updatedSession);
    },
    [currentSession, currentSessionId],
  );

  return {
    sessions,
    currentSessionId,
    currentSession,
    agents,
    setAgents,
    prompt,
    setPrompt,
    messagesEndRef,
    handleNewSession,
    pushSessionToCurrentSession,
    updateSessionsList,
    handleSelectSession,
    handleDeleteSession,
    updateSessionTitle,
    addMessage,
    scrollToBottom,
  };
};
