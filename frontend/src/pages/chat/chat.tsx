import React, { useState, useCallback } from "react";
import { message } from "antd";
import { AIKey } from "@renderer/types/common";
import type { Message } from "@type/session";
import ChatPanel from "@renderer/components/ChatPanel";
import AISender from "@renderer/components/common/AISender";
import { getLocalStore } from "@renderer/utils/localStore";
import { useChat } from "@renderer/hooks/useChat";
import { updateSession } from "@renderer/services/session";
import { streamChat } from "@renderer/services/chatStream";
import { usePendingResponse } from "@renderer/hooks/usePendingResponse";
import { findPairedTimestamp } from "@renderer/utils/messageUtils";
import SessionList from "./components/SessionList";
import MessageArea from "./components/MessageArea";
import ResumeModal from "./components/ResumeModal";
import { resolveModelConfig } from "@renderer/utils/helper";

// 原 SSEEvent / parseSSEBuffer 已抽到 @renderer/utils/sse，
// 请求与流解析细节已抽到 @renderer/services/chatStream。
// 原 pending_response 暂存逻辑已抽到 @renderer/hooks/usePendingResponse。
// 原成对消息删除的查找逻辑已抽到 @renderer/utils/messageUtils。

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
  const [toolStatus, setToolStatus] = useState("");
  const [openAgent, setOpenAgent] = useState(true);

  const {
    pendingResponse,
    showResumeModal,
    setShowResumeModal,
    clearPending: clearPendingResponse,
    removePending,
    startAutoSave,
    stopAutoSave,
  } = usePendingResponse(currentSessionId);

  const handleSend = useCallback(
    async (inputValue: string, isResume = false) => {
      const userContent = inputValue.trim();
      const model = getLocalStore<string>("selectedAI")?.value || "";
      const config = resolveModelConfig(model);
      const api_key =
        ((getLocalStore("model")?.value as AIKey[]) || []).find(
          (c) => c.model === model,
        )?.key || "";

      if (!userContent || !currentSession) {
        messageApi.warning("消息不能为空");
        return true;
      }
      if (!model || !api_key) {
        messageApi.error("请选择模型");
        return true;
      }

      setIsThinking(true);
      setTypeId(currentSessionId);
      setToolStatus("");

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

        let accumulatedContent = "";
        setTypingDate(Date.now().toString());
        startAutoSave(() => accumulatedContent);

        const content = await streamChat({
          agent: openAgent,
          prompt: _prompt,
          model: config.model,
          baseUrl: config.url,
          apiKey: api_key,
          history: sessionToUpdate.messages,
          requestId: currentSessionId,
          onDelta: (delta) => {
            accumulatedContent += delta;
            setTypingTarget(accumulatedContent);
          },
          onToolCall: (name) => setToolStatus(`正在调用工具：${name}…`),
          onToolResult: (name) => setToolStatus(`工具 ${name} 已完成`),
        });

        const aiMessage: Message = {
          timestamp: Date.now(),
          role: "system",
          content,
        };
        sessionToUpdate = {
          ...sessionToUpdate,
          messages: [...sessionToUpdate.messages, aiMessage],
        };
      } catch (error) {
        console.error("发送消息时出错:", error);
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const detail =
            error instanceof Error ? error.message.trim() : String(error || "").trim();
          const errorMessage = detail
            ? `AI 调用失败：${detail}`
            : "抱歉，我在处理您的请求时遇到了问题，请稍后重试。";
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
        stopAutoSave();
        clearPendingResponse();
        setTypeId("");
        setToolStatus("");
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
      startAutoSave,
      stopAutoSave,
      clearPendingResponse,
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
  }, [pendingResponse, currentSession, handleSend, setShowResumeModal]);

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

      const { pairedTimestamp, blockedReason } = findPairedTimestamp(
        currentSession.messages,
        msg,
      );
      if (blockedReason === "first") {
        messageApi.warning("无法删除第一条消息");
        return;
      }
      if (blockedReason === "pending") {
        messageApi.warning("请先停止回复再删除消息");
        return;
      }

      const newMessages = currentSession.messages.filter(
        (m) =>
          m.timestamp !== msg.timestamp &&
          (pairedTimestamp === null || m.timestamp !== pairedTimestamp),
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
      removePending(sessionId);
      await handleDeleteSession(sessionId);
      messageApi.success("删除成功");
    },
    [sessions.length, handleDeleteSession, messageApi, removePending],
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
          toolStatus={toolStatus}
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
