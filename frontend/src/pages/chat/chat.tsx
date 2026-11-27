import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { message } from "antd";
import { AIKey } from "@renderer/types/common";
import type { Message } from "@type/session";
import ChatPanel from "@renderer/components/ChatPanel";
import AISender from "@renderer/components/common/AISender";
import { getLocalStore } from "@renderer/utils/localStore";
import { useChat } from "@renderer/hooks/useChat";
import { usePendingResponse } from "@renderer/hooks/usePendingResponse";
import { updateSession } from "@renderer/services/session";
// 原同步 SSE 请求层，已由后台任务 + 轮询替代
// import { streamChat } from "@renderer/services/chatStream";
import {
  hasRunningChatTask,
  listActiveChatSessions,
  restoreChatSession,
  startChatRun,
} from "@renderer/services/chatRunner";
import { getChatRun, subscribeChatRun } from "@renderer/services/chatLive";
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
    syncSessions,
  } = useChat();

  const [messageApi, contextHolder] = message.useMessage();
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
        // 立即持久化用户消息：切页返回时会话排序与内容才正确
        updateSession(sessionToUpdate).catch((error) =>
          console.error("保存用户消息失败:", error),
        );
      }

      let _prompt = userContent;
      if (prompt) {
        _prompt = `请基于以下文档内容回答问题：\n ${prompt}\n问题：${userContent}`;
      }

      // 本地暂存兜底：后台任务丢失（如后端重启）时仍可提示续写
      startAutoSave(() => getChatRun(sessionId)?.content || "");

      try {
        // 任务化：请求交给后端后台执行，后续增量由 chatRunner 轮询同步到
        // chatLive；页面切走甚至整页刷新后都能凭 taskId 恢复现场
        await startChatRun({
          sessionId,
          agent: openAgent,
          prompt: _prompt,
          model: config.model,
          baseUrl: config.url,
          apiKey: api_key,
          history: sessionToUpdate.messages,
        });
      } catch (error) {
        console.error("发送消息时出错:", error);
        stopAutoSave();
        const detail =
          error instanceof Error
            ? error.message.trim()
            : String(error || "").trim();
        messageApi.error(
          detail ? `AI 调用失败：${detail}` : "AI 调用失败，请稍后重试",
        );
        // 返回 true 让输入框保留内容，方便重试
        return true;
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
    ],
  );

  // 运行态不再镜像成组件 state，直接订阅全局运行注册表：
  // 页面切走再返回、整页刷新后重放事件，展示都从同一份 run 数据来。
  const subscribeRun = useCallback(
    (onStoreChange: () => void) => {
      if (!currentSessionId) return () => {};
      return subscribeChatRun(currentSessionId, onStoreChange);
    },
    [currentSessionId],
  );
  const run = useSyncExternalStore(subscribeRun, () =>
    getChatRun(currentSessionId),
  );
  const isThinking = run?.status === "running";

  // 返回聊天页时，自动切换到仍有进行中回答的会话（仅首次，避免影响手动切会话）。
  // 候选会话直接从内存注册表和本地任务标记同步得出，不再逐个会话发请求。
  const autoRestoredRef = useRef(false);
  useEffect(() => {
    if (autoRestoredRef.current || !sessions.length) return;
    autoRestoredRef.current = true;

    const candidates = listActiveChatSessions().filter(
      (id) => id !== currentSessionId && sessions.some((item) => item.id === id),
    );
    if (!candidates.length) return;

    (async () => {
      for (const id of candidates) {
        if (await hasRunningChatTask(id)) {
          handleSelectSession(id);
          return;
        }
      }
    })();
  }, [sessions, currentSessionId, handleSelectSession]);

  // 恢复与收尾：
  //  - 内存有运行记录：正在运行则隐藏「是否继续」弹窗
  //  - 内存为空：统一走 restoreChatSession（内存 → taskId 探测 → pending 兜底）
  //  - 进入终态：停止本地暂存、清弹窗、补拉会话显示最终 AI 消息
  useEffect(() => {
    if (!currentSessionId) return;
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      stopAutoSave();
      clearPendingResponse();
      syncSessions(currentSessionId).catch((error) =>
        console.error("刷新会话失败:", error),
      );
    };

    const current = getChatRun(currentSessionId);
    if (current) {
      if (current.status === "running") setShowResumeModal(false);
      else settle();
    } else {
      restoreChatSession(currentSessionId)
        .then((restored) => {
          // 恢复失败（后端重启 / 任务已回收）：保留 ResumeModal 兜底
          if (!restored) return;
          if (restored.status === "running") setShowResumeModal(false);
          else settle();
        })
        .catch((error) => console.error("恢复聊天任务失败:", error));
    }

    const unsubscribe = subscribeChatRun(currentSessionId, (next) => {
      if (!next) return;
      if (next.status === "running") {
        setShowResumeModal(false);
        return;
      }
      settle();
    });
    return unsubscribe;
  }, [
    currentSessionId,
    syncSessions,
    stopAutoSave,
    clearPendingResponse,
    setShowResumeModal,
  ]);

  const handleResumeResponse = useCallback(() => {
    if (pendingResponse && currentSession) {
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
          run={run}
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
