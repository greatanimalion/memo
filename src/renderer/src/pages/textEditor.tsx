import { useEffect, useRef } from "react";
import { useWriterStore } from "../store/useWriterStore";
import VirtualTextEditor from "../components/VirtualTextEditor";
import { AIAssistantPanel } from "../components/WriterAssistant";

export default function TextEditorPage() {
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const book = useWriterStore((s) => s.book);
  const updateChapterContent = useWriterStore((s) => s.updateChapterContent);
  const loadBook = useWriterStore((s) => s.loadBook);
  const saveBook = useWriterStore((s) => s.saveBook);
  const _loaded = useWriterStore((s) => s._loaded);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!_loaded) loadBook();
  }, [_loaded, loadBook]);

  useEffect(() => {
    saveTimerRef.current = setInterval(() => {
      saveBook();
    }, 5000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [saveBook]);

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);

  return (
    <div className="h-full w-full flex bg-gray-50">
      <VirtualTextEditor
        content={currentChapter?.content || ""}
        onChange={(content) => {
          if (currentChapterId) {
            updateChapterContent(currentChapterId, content);
          }
        }}
      />
      <AIAssistantPanel />
    </div>
  );
}
