import React, { useRef, useEffect, useState } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { fontFamilyMap } from '../../../components/WriterAssistant/ChapterToolbar';
import { Button } from 'antd';
import {
  BookOutlined,
  UserOutlined,
  ExpandOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import useAppStore from '@renderer/store/app';

interface EditorAreaProps {
  content: string;
  onChange: (content: string) => void;
}


const EditorArea: React.FC<EditorAreaProps> = ({ content, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [column, setColumn] = useState(1);

  const book = useWriterStore((s) => s.book);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const editorBg = useWriterStore((s) => s.editorBg);
  const appStore = useAppStore();

  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== content) {
      textareaRef.current.value = content;
      updateLineInfo();
    }
  }, [content]);

  const updateLineInfo = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.value;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    setLineCount(lines.length);
    setColumn(lines[lines.length - 1].length + 1);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    updateLineInfo();
  };

  const handleSelect = () => {
    updateLineInfo();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const tabSpaces = '  ';
      const newText = text.substring(0, start) + tabSpaces + text.substring(end);
      onChange(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tabSpaces.length;
        updateLineInfo();
      }, 0);
    } else {
      setTimeout(updateLineInfo, 0);
    }
  };

  const textareaStyle: React.CSSProperties = {
    fontFamily: fontFamilyMap[editorSettings.fontFamily],
    fontSize: `${editorSettings.fontSize}px`,
    lineHeight: editorSettings.lineHeight,
    fontWeight: editorSettings.fontWeight,
  };

  const editorBgStyle: React.CSSProperties = editorBg
    ? editorBg.type === 'image'
      ? {
        backgroundImage: `url(${editorBg.value})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
      : { backgroundColor: editorBg.value }
    : {};

  const isDarkBg = editorBg?.type === 'color' && ['#1e1e2e'].includes(editorBg.value);
  const textareaTextColor = isDarkBg ? '#e0e0e0' : undefined;

  const charCount = content.length;

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
            <UserOutlined className={`text-xs ${isDarkBg ? 'text-theme-muted' : 'text-theme-muted'}`} />
            <span className={`text-[13px] ${isDarkBg ? 'text-theme-secondary' : 'text-theme-secondary'}`}>{book.author}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-3 text-[12px] mr-2 ${isDarkBg ? 'text-theme-muted' : 'text-theme-muted'}`}>
            <span>{new Date().toLocaleDateString('zh-CN')}</span>
            <span className={isDarkBg ? 'text-theme-muted' : 'text-theme-light'}>·</span>
            <span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className={`px-2.5 py-0.5 rounded-full font-medium ${isDarkBg ? 'bg-theme-tertiary text-accent-light' : 'bg-accent-light text-accent'
              }`}>
              {charCount} 字
            </span>
          </div>
          {/* 全屏切换 */}
          <Button
            size="small"
            type="text"
            icon={appStore.isBookScreen
              ? <CompressOutlined className={`text-sm ${isDarkBg ? 'text-theme-muted' : 'text-theme-muted'}`} />
              : <ExpandOutlined className={`text-sm ${isDarkBg ? 'text-theme-muted' : 'text-theme-muted'}`} />
            }
            onClick={(!appStore.isBookScreen ? appStore.intoBookScreen : appStore.exitBookScreen)}
            className={`rounded-lg transition-all ${isDarkBg ? 'hover:bg-theme-hover hover:text-accent-light' : 'hover:bg-theme-hover hover:text-accent'
              }`}
            title={appStore.isBookScreen ? '退出全屏 (Esc)' : '全屏编辑 (Ctrl+F11)'}
          />
        </div>
      </div>
      {/* 编辑区主体 */}
      <div className="flex-1 flex overflow-hidden">
        <div
          className="flex-1 overflow-hidden relative transition-colors duration-200"
          style={editorBgStyle}
        >
          {editorBg?.type === 'image' && (
            <div className={`absolute inset-0 ${isDarkBg ? 'bg-black/40' : 'bg-theme-primary/70'} backdrop-blur-[1px]`} />
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            className={`w-full h-full bg-transparent border-none outline-none resize-none placeholder-theme-muted selection:bg-accent-light relative z-10 ${appStore.isBookScreen ? 'px-12 py-8 max-w-4xl mx-auto' : 'px-8 py-6'
              } ${isDarkBg ? 'text-theme-primary placeholder-theme-muted' : 'text-theme-primary'}`}
            style={{ ...textareaStyle, color: textareaTextColor }}
            placeholder="开始写作..."
            spellCheck={false}
          />
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
          <span className={isDarkBg ? 'text-theme-muted' : 'text-theme-light'}>|</span>
          <span>{charCount} 字</span>
        </div>
      </div>
    </div>
  );
};

export default EditorArea;
