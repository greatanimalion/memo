import React, { useEffect, useState, useCallback } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { fontFamilyMap } from '../../../components/WriterAssistant/ChapterToolbar';
import { Button } from 'antd';
import {
  BookOutlined,
  ExpandOutlined,
  CompressOutlined,
  SaveOutlined,
  CloudOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import useAppStore from '@renderer/store/app';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode, $getSelection, $isRangeSelection, EditorState, KEY_TAB_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import { debounce } from '@renderer/utils';
import { Chapter } from '@type';

// ========== 内层组件：所有依赖 LexicalComposer Context 的逻辑 ==========
const LexicalEditorContent: React.FC<{
  currentChapter: Chapter | null;
  updateChapterContent: (id: string, content: string) => void;
  setLineCount: (count: number) => void;
  setColumn: (col: number) => void;
}> = ({ currentChapter, updateChapterContent, setLineCount, setColumn }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor || !currentChapter) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear(); // 清空当前内容
      const p = $createParagraphNode();
      p.append($createTextNode(currentChapter.content));
      root.append(p);

    });
  }, [editor, currentChapter?.id]);

  // Tab 键插入制表符
  useEffect(() => {
    if (!editor) return;
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText("\t");
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const handleLexicalChange = useCallback(
    debounce((editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        const text = root.getTextContent();
        if (currentChapter?.id) {
          updateChapterContent(currentChapter.id, text);
        }
        // 更新行列信息（供底部状态栏使用）
        const lines = text.split('\n');
        setLineCount(lines.length || 1);
        setColumn(lines[lines.length - 1]?.length + 1 || 1);
      });
    }, 500),
    [currentChapter, updateChapterContent, setLineCount, setColumn]
  );

  return (
    <>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="w-full min-h-full outline-none resize-none"
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <OnChangePlugin onChange={handleLexicalChange} />
    </>
  );
};

const EditorArea: React.FC = () => {
  const [lineCount, setLineCount] = useState(1);
  const [column, setColumn] = useState(1);
  const book = useWriterStore((s) => s.book);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const editorBg = useWriterStore((s) => s.editorBg);
  const autoSave = useWriterStore((s) => s.autoSave);
  const setAutoSave = useWriterStore((s) => s.setAutoSave);
  const updateChapterContent = useWriterStore((s) => s.updateChapterContent);
  const currentChapter = useWriterStore((s) => s.currentChapter);
  const appStore = useAppStore();

  const textareaStyle: React.CSSProperties = {
    fontFamily: fontFamilyMap[editorSettings.fontFamily],
    fontSize: `${editorSettings.fontSize}px`,
    lineHeight: editorSettings.lineHeight,
    fontWeight: editorSettings.fontWeight,
  };

  const isDarkBg = editorBg?.type === 'color' && ['#1e1e2e'].includes(editorBg.value);


  const initialConfig = {
    namespace: 'BookEditor',
    theme: {
      paragraph: 'editor-paragraph',
      text: {
        bold: 'editor-text-bold',
        italic: 'editor-text-italic',
        underline: 'editor-text-underline',
        strikethrough: 'editor-text-strikethrough',
      },
    },
    onError: (error: Error) => console.error(error),
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 顶部信息栏 */}
      <div className={`flex items-center justify-between px-5 py-2.5 border-b transition-colors duration-200 ${appStore.isBookScreen
        ? isDarkBg
          ? 'bg-theme-primary/80 border-theme backdrop-blur-sm'
          : 'bg-theme-primary/60 border-theme-light backdrop-blur-sm'
        : 'bg-theme-primary/80 border-theme-light backdrop-blur-sm'
        }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOutlined className={`text-sm ${isDarkBg ? 'text-accent-light' : 'text-accent'}`} />
            <span className={`text-sm font-semibold ${isDarkBg ? 'text-theme-primary' : 'text-theme-primary'}`}>{book.title}</span>
          </div>
          <div className={`w-px h-3.5 ${isDarkBg ? 'bg-theme-border' : 'bg-theme-light'}`} />
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-theme-secondary">标题:《{currentChapter?.title}》</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-[12px] mr-2 text-theme-muted">
            <span>{new Date().toLocaleDateString('zh-CN')}</span>
            <span className="text-theme-light">·</span>
            <span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className={`px-2.5 py-0.5 rounded-full font-medium ${isDarkBg ? 'bg-theme-tertiary text-accent-light' : 'bg-accent-light text-accent'
              }`}>
              {currentChapter?.wordCount} 字
            </span>
          </div>
          <Button
            size="small"
            type="text"
            icon={autoSave ? <CloudOutlined className="text-sm text-accent" /> : <CloudDownloadOutlined className="text-sm text-theme-muted" />}
            onClick={() => setAutoSave(!autoSave)}
            className="rounded-lg transition-all hover:bg-theme-hover hover:text-accent"
            title={autoSave ? '自动保存中' : '手动保存模式'}
          />
          {!autoSave && (
            <Button
              size="small"
              type="text"
              icon={<SaveOutlined className="text-sm text-theme-muted" />}
              onClick={() => useWriterStore.getState().saveCurrentChapter()}
              className="rounded-lg transition-all hover:bg-theme-hover hover:text-accent"
              title="保存当前章节"
            />
          )}
          <Button
            size="small"
            type="text"
            icon={appStore.isBookScreen
              ? <CompressOutlined className="text-sm text-theme-muted" />
              : <ExpandOutlined className="text-sm text-theme-muted" />
            }
            onClick={(!appStore.isBookScreen ? appStore.intoBookScreen : appStore.exitBookScreen)}
            className="rounded-lg transition-all hover:bg-theme-hover hover:text-accent"
            title={appStore.isBookScreen ? '退出全屏' : '全屏编辑 '}
          />
        </div>
      </div>

      {/* 编辑区主体 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto relative transition-colors duration-200">
          {editorBg?.type === 'image' && (
            <div className="absolute inset-0 bg-theme-primary/70 backdrop-blur-[1px]" />
          )}
          <LexicalComposer initialConfig={initialConfig}>
            <div
              className={`w-full min-h-full relative z-10 ${appStore.isBookScreen ? 'px-12 py-8 max-w-4xl mx-auto' : 'px-8 py-6'
                }`}
              style={textareaStyle}
            >
              <LexicalEditorContent
                currentChapter={currentChapter}
                updateChapterContent={updateChapterContent}
                setLineCount={setLineCount}
                setColumn={setColumn}
              />
            </div>
          </LexicalComposer>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className={`px-5 py-1.5 border-t flex items-center justify-between text-[11px] transition-colors duration-200 ${isDarkBg
        ? 'bg-theme-primary/60 border-theme text-theme-muted backdrop-blur-sm'
        : 'bg-theme-primary/60 border-theme-light text-theme-muted backdrop-blur-sm'
        }`}>
        <div className="flex items-center gap-3">
          <span className={`px-1.5 py-0.5 rounded ${isDarkBg ? 'bg-theme-tertiary text-theme-muted' : 'bg-theme-secondary text-theme-muted'}`}>UTF-8</span>
          <span className={`px-1.5 py-0.5 rounded ${isDarkBg ? 'bg-theme-tertiary text-theme-muted' : 'bg-theme-secondary text-theme-muted'}`}>LF</span>
        </div>
        <div className="flex items-center gap-3">
          <span>行 {lineCount}，列 {column}</span>
          <span className="text-theme-light">|</span>
          <span>{currentChapter?.wordCount} 字</span>
        </div>
      </div>
    </div>
  );
};

export default EditorArea;