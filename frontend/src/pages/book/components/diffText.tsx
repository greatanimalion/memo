// 左侧章节预览：正文视图与 AI 改写对比（react-diff-view），以及「确认覆盖」操作。
// 左右分栏的宽度与拖拽由 AgentEditor 负责，本组件只渲染左栏内容。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Segmented, message as antdMessage } from "antd";
import {
  CheckOutlined,
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
// 对比视图使用 react-diff-view：先用 diff 生成 unified diff，再解析成 hunks 渲染
import { parseDiff, Diff, Hunk, tokenize, markEdits } from "react-diff-view";
import "react-diff-view/style/index.css";
import { createTwoFilesPatch } from "diff";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { mergeChapterAI } from "@renderer/services/book";

interface DiffTextProps {
  /** 右侧对话是否显示，用于切换收起/展开箭头方向 */
  rightVisible: boolean;
  /** 收起 / 展开右侧对话 */
  onToggleRight: () => void;
  /** 由父级计算的左栏宽度样式 */
  style?: React.CSSProperties;
}

/** 深色主题判断，与 AntDesignThemeProvider 保持一致。 */
function isDarkTheme(): boolean {
  const darkThemes = [
    "theme-classic-black",
    "theme-modern-dark",
    "theme-deep-blue",
    "theme-premium-gray",
  ];
  return darkThemes.some((cls) => document.body.classList.contains(cls));
}

export function DiffText({ rightVisible, onToggleRight, style }: DiffTextProps) {
  const book = useWriterStore((s) => s.book);
  const currentChapter = useWriterStore((s) => s.currentChapter);
  const loadBookById = useWriterStore((s) => s.loadBookById);

  const [viewMode, setViewMode] = useState<"text" | "diff">("text");
  // 正在把 AI 正文合并到 content
  const [merging, setMerging] = useState(false);

  // 切换章节时重置为正文视图
  useEffect(() => {
    setViewMode("text");
  }, [currentChapter?.id]);

  const isAiChapter = currentChapter?.isAi === 1;
  // AI 章节的正文在 aiRes；人工章节的正文在 content
  const previewText = isAiChapter
    ? currentChapter?.aiRes || ""
    : currentChapter?.content || "";

  // 对比视图：content（原文）与 aiRes（AI 更改）的 unified diff 与词级高亮
  const diffData = useMemo(() => {
    if (viewMode !== "diff" || !currentChapter || currentChapter.isAi !== 1) {
      return { hunks: [], tokens: null };
    }
    // react-diff-view 的解析器要求 git 格式头部（diff --git ...），
    // 而 diff 包输出的是 "=====" 分隔行，这里替换掉再解析。
    const patch = createTwoFilesPatch(
      "a/content",
      "b/aiRes",
      currentChapter.content || "",
      currentChapter.aiRes || "",
      "",
      "",
      { context: 3 },
    ).replace(/^=+\n/, "diff --git a/content b/aiRes\n");
    const hunks = parseDiff(patch).flatMap((file) => file.hunks);
    const tokens = hunks.length
      ? tokenize(hunks, { enhancers: [markEdits(hunks, { type: "block" })] })
      : null;
    return { hunks, tokens };
  }, [viewMode, currentChapter?.content, currentChapter?.aiRes, currentChapter?.isAi]);

  // 确认合并：后端读取 aiRes 覆盖 content，并把 isAi 置为 0
  const handleMergeAI = useCallback(async () => {
    const chapterId = currentChapter?.id;
    if (!chapterId || merging) return;
    setMerging(true);
    try {
      await mergeChapterAI(chapterId);
      antdMessage.success("已将 AI 正文合并到 content");
      setViewMode("text");
      // 刷新书籍与当前章节，让 isAi/字数等状态同步更新
      await loadBookById(book.id);
      const state = useWriterStore.getState();
      if (state.currentChapter?.id === chapterId) {
        await state.setCurrentChapter(chapterId);
      }
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : "合并失败");
    } finally {
      setMerging(false);
    }
  }, [currentChapter?.id, merging, loadBookById, book.id]);

  if (!currentChapter) return null;

  return (
    <aside
      style={style}
      className="flex h-full w-[45%] min-w-75 max-w-180 shrink-0 flex-col border-r border-theme-light bg-theme-primary/40"
    >
      <div className="flex items-center gap-2 border-b border-theme-light px-3 py-2.5 shrink-0">
        <FileTextOutlined className="text-accent shrink-0" />
        <span className="truncate text-sm font-semibold text-theme-primary">
          {currentChapter.title || "未命名章节"}
        </span>
        {isAiChapter && (
          <span className="shrink-0 rounded-full bg-accent-light px-2 py-0.5 text-[10px] text-accent">
            AI 生成
          </span>
        )}
        <div className="flex-1" />
        {isAiChapter && (
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={merging}
            disabled={!currentChapter.aiRes}
            title="用 AI 正文覆盖 content，并标记为人工内容"
            onClick={() => void handleMergeAI()}
          >
            确认覆盖
          </Button>
        )}
        {isAiChapter && (
          <Segmented
            size="small"
            value={viewMode}
            onChange={(value) => setViewMode(value as "text" | "diff")}
            options={[
              { label: "正文", value: "text" },
              { label: "对比", value: "diff" },
            ]}
          />
        )}
        <Button
          type="text"
          size="small"
          icon={rightVisible ? <RightOutlined /> : <LeftOutlined />}
          title={rightVisible ? "收起右侧对话" : "展开右侧对话"}
          onClick={onToggleRight}
        />
      </div>

      {viewMode === "diff" && isAiChapter ? (
        <div
          className={isDarkTheme() ? "diff-wrap diff-wrap-dark" : "diff-wrap"}
        >
          {diffData.hunks.length > 0 ? (
            <Diff
              viewType="split"
              diffType="modify"
              hunks={diffData.hunks}
              tokens={diffData.tokens}
            >
              {(hunks) =>
                hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
              }
            </Diff>
          ) : (
            <div className="p-4 text-sm italic text-theme-muted">
              两侧内容一致，暂无差异
            </div>
          )}
        </div>
      ) : (
        /* 原 react-diff-viewer-continued 实现（已替换为 react-diff-view）
        <div className="flex-1 min-h-0 overflow-auto p-2">
          <ReactDiffViewer
            oldValue={currentChapter.content || ""}
            newValue={currentChapter.aiRes || ""}
            splitView
            useDarkTheme={isDarkTheme()}
            compareMethod={DiffMethod.WORDS}
            leftTitle="原文"
            rightTitle="AI更改"
            hideLineNumbers
            disableWorker
          />
        </div>
        */
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {previewText ? (
            <div className="whitespace-pre-wrap wrap-break-word text-[13px] leading-7 text-theme-secondary">
              {previewText}
            </div>
          ) : (
            <div className="text-sm italic text-theme-muted">暂无正文</div>
          )}
        </div>
      )}
    </aside>
  );
}
