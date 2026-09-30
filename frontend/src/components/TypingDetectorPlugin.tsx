import React, { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { markTyping } from "@renderer/store/useUsageStore";

const IDLE_MS = 2000;

// 程序性更新不应计入“码字时长”：
// - history-merge：HistoryPlugin 的合并写入
// - programmatic：切换章节时整体灌入正文（EditorArea 会带上该 tag）
const IGNORED_TAGS = new Set(["history-merge", "programmatic"]);

interface TypingDetectorPluginProps {
  /** 打字状态变化回调；不传时仅调用全局 markTyping */
  onTypingChange?: (isTyping: boolean) => void;
}

/**
 * 基于 Lexical UpdateListener 的打字检测：编辑器内容变化即标记一次打字，
 * 连续 2 秒无变化后结束。
 */
const TypingDetectorPlugin: React.FC<TypingDetectorPluginProps> = ({
  onTypingChange,
}) => {
  const [editor] = useLexicalComposerContext();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const removeListener = editor.registerUpdateListener(({ tags }) => {
      let ignored = false;
      tags.forEach((tag) => {
        if (IGNORED_TAGS.has(tag)) ignored = true;
      });
      if (ignored) return;

      markTyping();
      onTypingChange?.(true);

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        onTypingChange?.(false);
      }, IDLE_MS);
    });

    return () => {
      removeListener();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [editor, onTypingChange]);

  return null;
};

export default TypingDetectorPlugin;
