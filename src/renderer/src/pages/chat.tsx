import React, { useState, useCallback, useEffect } from "react";
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  AliwangwangOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Empty, message, Modal } from "antd";
import { AIKey } from "@renderer/types/common";
import type { Message } from "@type/agents";
import { formatTime } from "@renderer/utils/dateUtils";
import ChatPanel from "@renderer/components/ChatPanel";
import { XMarkdown } from "@ant-design/x-markdown";
import AISender from "@renderer/components/common/AISender";
import { Think } from "@ant-design/x";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";
import { useChat } from "@renderer/hooks/useChat";
import { updateSession } from "@renderer/services/session";

const ChatPage: React.FC = () => {
  const {
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
    handleSelectSession,
    handleDeleteSession,
  } = useChat();

  const [messageApi, contextHolder] = message.useMessage();
  const [isTyping, setIsTyping] = useState(false);
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
      setIsTyping(true);

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
        const url = openAgent
          ? "http://localhost:32068/api/chat-agent"
          : "http://localhost:32068/api/chat-stream";
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
        setIsTyping(false);
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
            pairedTimestamp = currentSession.messages[i - 1].timestamp;
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
            pairedTimestamp = currentSession.messages[i + 1].timestamp;
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

  const getMessageActions = useCallback(
    (msg: Message) => [
      {
        key: "copy",
        label: "复制",
        icon: <CopyOutlined />,
        onClick: () => handleCopyMessage(msg.content),
      },
      {
        key: "delete",
        label: "删除",
        icon: <DeleteOutlined />,
        onClick: () => deleteMessage(msg),
      },
    ],
    [handleCopyMessage, deleteMessage],
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
      <Modal
        title="恢复未完成的回复"
        open={showResumeModal}
        footer={[
          <Button key="discard" onClick={clearPendingResponse}>
            放弃
          </Button>,
          <Button key="resume" type="primary" onClick={handleResumeResponse}>
            <AliwangwangOutlined /> 继续回复
          </Button>,
        ]}
      >
        <p>检测到您上次有未完成的AI回复，是否继续？</p>
        <div className="mt-3 p-3 bg-gray-50 rounded-lg max-h-40 overflow-auto">
          <p className="text-sm text-gray-600">上次已收到的内容：</p>
          <XMarkdown content={pendingResponse?.content || ""} />
        </div>
      </Modal>

      <div className="w-60 border-r border-gray-200 overflow-auto flex flex-col max-md:w-0 transition-width duration-300">
        <div className="p-4 border-b border-gray-200">
          <Button
            icon={<PlusOutlined />}
            onClick={handleNewSession}
            className="w-full"
          >
            新建对话
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.length > 0 ? (
            sessions.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectSession(conv.id)}
        <div className="p-3 rounded-lg cursor-pointer transition-all duration-200"
          style={{
            backgroundColor: currentSessionId === conv.id ? "var(--bg-tertiary)" : "transparent",
            boxShadow: currentSessionId === conv.id ? "var(--shadow-lg)" : "none",
          }}
          onMouseEnter={(e) => {
            if (currentSessionId !== conv.id) e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (currentSessionId !== conv.id) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {conv.title}
                    </h3>
                    <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                      {conv.messages.length > 1
                        ? conv.messages[conv.messages.length - 1].content.slice(
                            0,
                            30,
                          )
                        : "新对话"}
                    </p>
                  </div>
                  {sessions.length > 1 && (
                      <button
                        onClick={(e) => handleDeleteSessionWithEvent(conv.id, e)}
                        className="p-1 rounded transition-colors ml-2 cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <DeleteOutlined className="text-sm" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-5">
              <Empty />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {currentSession?.messages.map((msg) => (
              <div
                key={msg.timestamp}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`flex items-start gap-3 max-w-[85%] overflow-auto ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className="flex-1">
                    <Dropdown
                      menu={{ items: getMessageActions(msg as Message) }}
                      trigger={["contextMenu"]}
                    >
                      <div
                        className="rounded-2xl px-4 py-3"
                        style={{
                          backgroundColor: msg.role === "user" ? "var(--info-color)" : "var(--bg-tertiary)",
                          color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                          borderRadius: msg.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
                        }}
                      >
                        <XMarkdown content={msg.content} />
                        <p className="text-xs mt-2" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.7)" : "var(--text-muted)" }}>
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </Dropdown>
                  </div>
                </div>
              </div>
            ))}

            {isThinking && currentSessionId === typeId && (
              <div className="flex justify-start">
                <div className="flex items-start gap-3 max-w-[85%]">
                  <div className="flex-1">
                    <Think title="Complete thinking" blink loading={true} />
                    {isTyping && (
                      <div className="rounded-2xl px-4 py-3 rounded-tl-sm" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                        <XMarkdown content={typingTarget} />
                        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                          {formatTime(+typingDate)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

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
