import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";

/**
 * 未完成响应的本地暂存。
 *
 * 流式回答过程中按秒把已生成内容写入 localStorage，页面刷新或切换会话后
 * 可以提示用户继续；回答结束后清除。原先这段逻辑直接写在 chat.tsx 里，
 * 这里集中收敛，并顺带处理定时器清理。
 */

export interface PendingResponse {
  content: string;
  timestamp: number;
}

const pendingKey = (sessionId: string) => `pending_response_${sessionId}`;

export function usePendingResponse(sessionId: string) {
  const [pendingResponse, setPendingResponse] = useState<PendingResponse | null>(
    null,
  );
  const [showResumeModal, setShowResumeModal] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 切换会话时重新读取该会话的暂存内容。
  useEffect(() => {
    setPendingResponse(null);
    setShowResumeModal(false);
    if (!sessionId) return;

    const saved = getLocalStore<string>(pendingKey(sessionId))?.value;
    if (!saved) return;
    try {
      const data = JSON.parse(saved) as PendingResponse;
      if (data.content && data.content.length > 0) {
        setPendingResponse(data);
        setShowResumeModal(true);
      }
    } catch (e) {
      console.error("解析未完成响应失败:", e);
    }
  }, [sessionId]);

  const savePending = useCallback(
    (content: string) => {
      if (!sessionId || !content) return;
      setLocalStore(pendingKey(sessionId), {
        value: JSON.stringify({ content, timestamp: Date.now() }),
      });
    },
    [sessionId],
  );

  /** 清除当前会话的暂存内容，并关闭续写提示。 */
  const clearPending = useCallback(() => {
    if (sessionId) {
      setLocalStore(pendingKey(sessionId), { value: "" });
    }
    setPendingResponse(null);
    setShowResumeModal(false);
  }, [sessionId]);

  /** 仅清除指定会话的暂存内容（例如删除会话时），不影响当前提示状态。 */
  const removePending = useCallback((targetSessionId: string) => {
    if (!targetSessionId) return;
    setLocalStore(pendingKey(targetSessionId), { value: "" });
  }, []);

  const stopAutoSave = useCallback(() => {
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current);
      autoSaveRef.current = null;
    }
  }, []);

  /** 开始每秒把最新内容写入暂存；需在回答结束时调用 stopAutoSave。 */
  const startAutoSave = useCallback(
    (getContent: () => string) => {
      stopAutoSave();
      autoSaveRef.current = setInterval(() => {
        const content = getContent();
        if (content.length > 0) savePending(content);
      }, 1000);
    },
    [savePending, stopAutoSave],
  );

  // 组件卸载时清理计时器。
  useEffect(() => stopAutoSave, [stopAutoSave]);

  return {
    pendingResponse,
    showResumeModal,
    setShowResumeModal,
    savePending,
    clearPending,
    removePending,
    startAutoSave,
    stopAutoSave,
  };
}
