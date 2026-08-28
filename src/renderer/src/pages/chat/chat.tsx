import React, { useState, useCallback, useEffect } from "react";
import { message } from "antd";
import { AIKey } from "@renderer/types/common";
import type { Message } from "@type/session";
import ChatPanel from "@renderer/components/ChatPanel";
import AISender from "@renderer/components/common/AISender";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";
import { useChat } from "@renderer/hooks/useChat";
import { updateSession } from "@renderer/services/session";
import SessionList from "./components/SessionList";
import MessageArea from "./components/MessageArea";
import ResumeModal from "./components/ResumeModal";
import { getApiUrl } from "@renderer/utils";

const ChatPage: React.FC = () => {
  const {
    sessions,
    currentSessionId,
    currentSession,
    agents,
    setAgents,
    prompt,
    setPrompt,
    handleNewSession,
    pushSessionToCurrentSession,
    handleSelectSession,
    handleDeleteSession,
  } = useChat();

  const [messageApi, contextHolder] = message.useMessage();
  const [typingDate, setTypingDate] = useState("");
  const [typingTarget, setTypingTarget] = useState("");
  const [typeId, setTypeId] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [openAgent, setOpenAgent] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<{
    content: string;
    timestamp: number;
  } | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);

  useEffect(() => {
    if (currentSessionId) {
      const pendingKey = `pending_response_${currentSessionId}`;
      const saved = getLocalStore<string>(pendingKey)?.value;
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.content && data.content.length > 0) {
            setPendingResponse(data);
            setShowResumeModal(true);
          }
        } catch (e) {
          console.error("解析未完成响应失败:", e);
        }
      }
    }
  }, [currentSessionId]);

  const clearPendingResponse = useCallback(() => {
    if (currentSessionId) {
      const pendingKey = `pending_response_${currentSessionId}`;
      setLocalStore(pendingKey, { value: "" });
      setPendingResponse(null);
      setShowResumeModal(false);
    }
  }, [currentSessionId]);

  const handleSend = useCallback(
    async (inputValue: string, isResume = false) => {
      const userContent = inputValue.trim();
      const model = getLocalStore("selectedAI")?.value || "";
      const api_key =
        ((getLocalStore("model")?.value as AIKey[]) || []).find(
          (c) => c.model === model,
        )?.key || "";

      if (!userContent || !currentSession) {
        messageApi.warning("消息不能为空");
        return;
      }
      if (!model || !api_key) {
        messageApi.error("请选择模型");
        return;
      }

      setIsThinking(true);
      setTypeId(currentSessionId);

      let sessionToUpdate = currentSession;

      if (!isResume) {
        const messId = Date.now();
        const userMessage: Message = {
          role: "user",
          content: userContent,
          timestamp: messId,
        };

        const updatedSessions = sessions.map((conv) => {
          if (conv.id === currentSessionId) {
            const newMessages = [...conv.messages, userMessage];
            let newTitle = conv.title;
            if (conv.messages.length <= 1) {
              newTitle =
                inputValue.slice(0, 16) + (inputValue.length > 16 ? "..." : "");
            }
            return { ...conv, title: newTitle, messages: newMessages };
          }
          return conv;
        });
        sessionToUpdate = updatedSessions.find(
          (c) => c.id === currentSessionId,
        )!;
        pushSessionToCurrentSession(sessionToUpdate);
      }

      try {
        let _prompt = userContent;
        if (prompt) {
          _prompt = `请基于以下文档内容回答问题：\n ${prompt}\n问题：${userContent}`;
        }
        const url = getApiUrl(`/api/${openAgent?'chat-agent:':'chat-stream'}`)
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: _prompt,
            model,
            apiKey: api_key,
            history: sessionToUpdate.messages,
            requestId: currentSessionId,
          }),
        });
        if (!response.body) {
          throw new Error("响应体为空");
        }
        const aiMessage: Message = {
          timestamp: Date.now(),
          role: "system",
          content: "",
        };
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedContent = "";
        setTypingDate(Date.now().toString());

        const saveInterval = setInterval(() => {
          if (accumulatedContent.length > 0 && currentSessionId) {
            const pendingKey = `pending_response_${currentSessionId}`;
            setLocalStore(pendingKey, {
              value: JSON.stringify({
                content: accumulatedContent,
                timestamp: Date.now(),
              }),
            });
          }
        }, 1000);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            accumulatedContent += chunk;
            setTypingTarget(accumulatedContent);
          }
          aiMessage.content = accumulatedContent;
        } finally {
          clearInterval(saveInterval);
          reader.releaseLock();
          if (currentSessionId) {
            const pendingKey = `pending_response_${currentSessionId}`;
            setLocalStore(pendingKey, { value: "" });
          }
        }
        sessionToUpdate = {
          ...sessionToUpdate,
          messages: [...sessionToUpdate.messages, aiMessage],
        };
      } catch (error) {
        console.error("发送消息时出错:", error);
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const errorMessage =
            "抱歉，我在处理您的请求时遇到了问题，请稍后重试。";
          sessionToUpdate = {
            ...sessionToUpdate,
            messages: [
              ...sessionToUpdate.messages,
              {
                role: "system",
                content: errorMessage,
                timestamp: Date.now(),
              },
            ],
          };
          setTypingTarget(errorMessage);
        }
      } finally {
        setTypeId("");
        pushSessionToCurrentSession(sessionToUpdate);
        setTypingTarget("");
        updateSession(sessionToUpdate);
        setIsThinking(false);
      }
    },
    [
      currentSession,
      currentSessionId,
      sessions,
      prompt,
      openAgent,
      messageApi,
      pushSessionToCurrentSession,
    ],
  );

  const handleResumeResponse = useCallback(() => {
    if (pendingResponse && currentSession) {
      setTypingTarget(pendingResponse.content);
      setTypingDate(pendingResponse.timestamp.toString());
      setShowResumeModal(false);
      const userMessage =
        currentSession.messages[currentSession.messages.length - 1];
      if (userMessage && userMessage.role === "user") {
        handleSend(userMessage.content, true);
      }
    }
  }, [pendingResponse, currentSession, handleSend]);

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    message.success("已复制到剪贴板");
  }, []);

  const deleteMessage = useCallback(
    (msg: Message) => {
      if (!currentSession) return;
      if (currentSession.messages.length === 1) {
        messageApi.warning("无法删除第一条消息");
        return;
      }

      let pairedTimestamp = 0;
      if (msg.role === "system") {
        for (let i = 0; i < currentSession.messages.length; i++) {
          if (currentSession.messages[i].timestamp === msg.timestamp) {
            if (i === 0) {
              messageApi.warning("无法删除第一条消息");
              return;
            }
            pairedTimestamp = currentSession.messages[i - 1].timestamp || 0;
            break;
          }
        }
      } else {
        for (let i = 0; i < currentSession.messages.length; i++) {
          if (i === currentSession.messages.length - 1) {
            messageApi.warning("请先停止回复再删除消息");
            return;
          }
          if (currentSession.messages[i].timestamp === msg.timestamp) {
            pairedTimestamp = currentSession.messages[i + 1].timestamp || 0;
            break;
          }
        }
      }

      const newMessages = currentSession.messages.filter(
        (m) => m.timestamp !== msg.timestamp && m.timestamp !== pairedTimestamp,
      );
      pushSessionToCurrentSession({ ...currentSession, messages: newMessages });
      updateSession({ ...currentSession, messages: newMessages });
    },
    [currentSession, messageApi, pushSessionToCurrentSession],
  );

  const handleDeleteSessionWithEvent = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (sessions.length === 1) {
        message.warning("至少保留一个对话");
        return;
      }
      const pendingKey = `pending_response_${sessionId}`;
      setLocalStore(pendingKey, { value: "" });
      await handleDeleteSession(sessionId);
      messageApi.success("删除成功");
    },
    [sessions.length, handleDeleteSession, messageApi],
  );

  return (
    <div className="flex flex-1 h-full w-full" style={{ backgroundColor: "var(--bg-primary)" }}>
      {contextHolder}
      <ResumeModal
        isOpen={showResumeModal}
        pendingResponse={pendingResponse}
        onDiscard={clearPendingResponse}
        onResume={handleResumeResponse}
      />

      <SessionList
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSessionWithEvent}
        onNewSession={handleNewSession}
      />

      <div className="flex-1 flex flex-col">
        <MessageArea
          messages={currentSession?.messages || []}
          currentSessionId={currentSessionId}
          isThinking={isThinking}
          typingTarget={typingTarget}
          typingDate={typingDate}
          typeId={typeId}
          onCopyMessage={handleCopyMessage}
          onDeleteMessage={deleteMessage}
        />

        <AISender
          openAgent={openAgent}
          setOpenAgent={setOpenAgent}
          setPrompt={setPrompt}
          handleSend={handleSend}
          isThinking={isThinking}
          requestId={currentSessionId}
          agents={agents}
        />
      </div>

      <ChatPanel
        handleCopyMessage={handleCopyMessage}
        agents={agents}
        setAgents={setAgents}
        sessions={sessions}
        currentSession={currentSession}
      />
    </div>
  );
};

export default ChatPage;