import React from "react";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { fontFamilyMap } from "./ChapterToolbar";
import LeftPanel from "@renderer/pages/book/components/LeftPanel";
import EditorArea from "@renderer/pages/book/components/EditorArea";
import RightPanel from "@renderer/pages/book/components/RightPanel";
import useAppStore from "@renderer/store/app";

const ChapterEditor: React.FC = () => {
  const book = useWriterStore((s) => s.book);
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const updateChapterContent = useWriterStore((s) => s.updateChapterContent);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const appStore = useAppStore();

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);

  if (!currentChapter) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 ">
        <div className="text-center">
          <div className="text-4xl mb-2">📝</div>
          <div className="text-sm">选择或创建一个章节开始写作</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="flex-1 overflow-hidden"
        style={{
          fontFamily: fontFamilyMap[editorSettings.fontFamily],
          fontSize: editorSettings.fontSize,
          lineHeight: editorSettings.lineHeight,
        }}
      >
        <div className={`flex h-full w-full ${appStore.isBookScreen ? '' : 'bg-[#f8f9fb]'}`}>
          <LeftPanel isBookScreen={appStore.isBookScreen} />
          <EditorArea
            key={currentChapter.id}
            content={currentChapter.content}
            onChange={(content) =>
              updateChapterContent(currentChapter.id, content)
            }
          />
          <RightPanel content={currentChapter.content} isBookScreen={appStore.isBookScreen} />
        </div>
      </div>
    </div>
  );
};

export default ChapterEditor;
