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
    updateSessionTitle,
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

      if (!userContent) {
        messageApi.warning("消息不能为空");
        return true;
      }

      // 与「AI 写书」保持一致：未显式选择模型时回退到第一个已配置的密钥，
      // 避免因为有密钥但没选模型而静默失败。
      const aiKeys = (getLocalStore("model")?.value as AIKey[]) || [];
      const selected = getLocalStore<string>("selectedAI")?.value || "";
      const chosen = aiKeys.find((item) => item.model === selected) || aiKeys[0];
      if (!chosen?.model || !chosen.key) {
        messageApi.error("请先在「APIKey管理」中配置模型密钥");
        return true;
      }
      const config = resolveModelConfig(chosen.model);
      const api_key = chosen.key;

      // 没有当前会话时自动新建，避免发送被静默忽略
      let session = currentSession;
      let sessionList = sessions;
      if (!session) {
        try {
          session = await handleNewSession();
        } catch (error) {
          console.error("新建会话失败:", error);
        }
        if (!session) {
          messageApi.error("新建会话失败，请检查后端服务是否正常");
          return true;
        }
        sessionList = [session, ...sessions];
      }
      const sessionId = session.id;

      setIsThinking(true);
      setTypeId(sessionId);
      setToolStatus("");

      let sessionToUpdate = session;

      if (!isResume) {
        const messId = Date.now();
        const userMessage: Message = {
          role: "user",
          content: userContent,
          timestamp: messId,
        };

        const updatedSessions = sessionList.map((conv) => {
          if (conv.id === sessionId) {
            const newMessages = [...conv.messages, userMessage];
            let newTitle = conv.title;
            if (conv.messages.length <= 1) {
              newTitle =
                inputValue.slice(0, 16) + (inputValue.length > 16 ? "..." : "");
            }
            return {
              ...conv,
              title: newTitle,
              messages: newMessages,
              // 同步更新时间，侧栏按时间分组排序时能立即置顶
              lastUpdated: messId,
            };
          }
          return conv;
        });
        sessionToUpdate =
          updatedSessions.find((c) => c.id === sessionId) ?? session;
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
          requestId: sessionId,
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
          lastUpdated: Date.now(),
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
      sessions,
      prompt,
      openAgent,
      messageApi,
      handleNewSession,
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
    async (sessionId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
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
        onRenameSession={updateSessionTitle}
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
