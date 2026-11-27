import { useCallback, useEffect, useRef, useState } from "react";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { DiffText } from "./diffText";
import { BookAgentPanel } from "./bookAgent";

interface AgentEditorProps {
  /** 返回普通编辑器（由 book.tsx 控制 AgentEditor / ManusEditor 的切换） */
  onClose?: () => void;
}

export function AgentEditor({ onClose }: AgentEditorProps) {
  const currentChapter = useWriterStore((s) => s.currentChapter);

  // 左右两栏的显示状态：各自可通过另一侧头部的箭头收起/展开
  const [leftVisible, setLeftVisible] = useState(true);
  const [rightVisible, setRightVisible] = useState(true);

  // 选中新章节时自动展开左侧预览
  useEffect(() => {
    if (currentChapter?.id) setLeftVisible(true);
  }, [currentChapter?.id]);

  // ───────── 左右分栏拖拽 ─────────
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);

  // 组件卸载时移除拖拽监听，避免残留
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    resizeCleanupRef.current?.();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const min = 320;
      // 右侧至少保留 420px，左侧最多 720px
      const max = Math.max(min, Math.min(rect.width - 420, 720));
      setLeftWidth(Math.min(Math.max(ev.clientX - rect.left, min), max));
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  }, []);

  return (
    <div ref={splitContainerRef} className="flex h-full w-full min-w-0">
      {/* ───────── 左侧：章节正文 / diff ───────── */}
      {currentChapter && leftVisible && (
        <DiffText
          rightVisible={rightVisible}
          onToggleRight={() => setRightVisible((value) => !value)}
          style={
            !rightVisible
              ? { flex: 1, width: "auto", maxWidth: "none" }
              : leftWidth !== null
                ? { width: leftWidth }
                : undefined
          }
        />
      )}

      {/* 左右分栏拖拽条：拖动改变宽度，双击恢复默认 */}
      {currentChapter && leftVisible && rightVisible && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="拖动调整宽度，双击恢复默认"
          onMouseDown={startResize}
          onDoubleClick={() => setLeftWidth(null)}
          className="group relative h-full w-1.5 shrink-0 cursor-col-resize"
        >
          <div
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
            style={{ backgroundColor: "var(--border-light)" }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      )}

      {/* ───────── 右侧：AI 写书对话 ───────── */}
      {rightVisible && (
        <BookAgentPanel
          leftVisible={leftVisible}
          onToggleLeft={() => setLeftVisible((value) => !value)}
          onClose={onClose}
        />
      )}
    </div>
  );
}
