import React, { useRef, useEffect, useState } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { fontFamilyMap } from '../../../components/WriterAssistant/ChapterToolbar';
import { Button, Popover } from 'antd';
import {
  BookOutlined,
  UserOutlined,
  ExpandOutlined,
  CompressOutlined,
  BgColorsOutlined,
  PictureOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import useAppStore from '@renderer/store/app';

interface EditorAreaProps {
  content: string;
  onChange: (content: string) => void;
}

const bgPresets = [
  { label: '默认', value: '#ffffff', icon: '⬜' },
  { label: '护眼绿', value: '#f0f7f0', icon: '🟩' },
  { label: '暖黄', value: '#fdf8ef', icon: '🟨' },
  { label: '淡蓝', value: '#f0f5fd', icon: '🟦' },
  { label: '淡紫', value: '#f5f0fd', icon: '🟪' },
  { label: '深色', value: '#1e1e2e', icon: '⬛' },
  { label: '羊皮纸', value: '#f5e6c8', icon: '🟫' },
  { label: '玫瑰', value: '#fdf0f0', icon: '🟥' },
];

const EditorArea: React.FC<EditorAreaProps> = ({ content, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [column, setColumn] = useState(1);

  const book = useWriterStore((s) => s.book);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const editorBg = useWriterStore((s) => s.editorBg);
  const setEditorBg = useWriterStore((s) => s.setEditorBg);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        setEditorBg({ type: 'image', value: result });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const bgPopoverContent = (
    <div className="w-56">
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">颜色预设</div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {bgPresets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => setEditorBg({ type: 'color', value: preset.value })}
            className={`group relative w-full aspect-square rounded-lg border-2 transition-all hover:scale-105 ${editorBg?.type === 'color' && editorBg.value === preset.value
                ? 'border-indigo-400 shadow-sm'
                : 'border-gray-100 hover:border-gray-200'
              }`}
            style={{ backgroundColor: preset.value }}
            title={preset.label}
          >
            {editorBg?.type === 'color' && editorBg.value === preset.value && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-2 h-2 rounded-full ${preset.value === '#1e1e2e' ? 'bg-white' : 'bg-indigo-500'}`} />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">自定义</div>
      <div className="flex gap-1.5">
        <Button
          size="small"
          icon={<PictureOutlined className="text-xs" />}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg"
        >
          上传图片
        </Button>
        <Button
          size="small"
          icon={<UndoOutlined className="text-xs" />}
          onClick={() => setEditorBg(null)}
          className="text-gray-400 hover:text-gray-600 rounded-lg"
          title="重置为默认"
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 顶部信息栏 */}
      <div className={`flex items-center justify-between px-5 py-2.5 border-b transition-colors duration-200 ${appStore.isBookScreen
          ? isDarkBg
            ? 'bg-gray-900/80 border-gray-700 backdrop-blur-sm'
            : 'bg-white/60 border-gray-100 backdrop-blur-sm'
          : 'bg-white/80 border-gray-100 backdrop-blur-sm'
        }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOutlined className={`text-sm ${isDarkBg ? 'text-indigo-300' : 'text-indigo-400'}`} />
            <span className={`text-sm font-semibold ${isDarkBg ? 'text-gray-200' : 'text-gray-800'}`}>{book.title}</span>
          </div>
          <div className={`w-px h-3.5 ${isDarkBg ? 'bg-gray-600' : 'bg-gray-200'}`} />
          <div className="flex items-center gap-1.5">
            <UserOutlined className={`text-xs ${isDarkBg ? 'text-gray-500' : 'text-gray-300'}`} />
            <span className={`text-[13px] ${isDarkBg ? 'text-gray-400' : 'text-gray-500'}`}>{book.author}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-3 text-[12px] mr-2 ${isDarkBg ? 'text-gray-500' : 'text-gray-400'}`}>
            <span>{new Date().toLocaleDateString('zh-CN')}</span>
            <span className={isDarkBg ? 'text-gray-600' : 'text-gray-200'}>·</span>
            <span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className={`px-2.5 py-0.5 rounded-full font-medium ${isDarkBg ? 'bg-gray-800 text-indigo-300' : 'bg-indigo-50 text-indigo-500'
              }`}>
              {charCount} 字
            </span>
          </div>
          {/* 背景设置 */}
          <Popover
            content={bgPopoverContent}
            trigger="click"
            placement="bottomRight"
            arrow={false}
            overlayInnerStyle={{ padding: '12px' }}
          >
            <Button
              size="small"
              type="text"
              icon={<BgColorsOutlined className={`text-sm ${isDarkBg ? 'text-gray-400' : 'text-gray-400'}`} />}
              className={`rounded-lg transition-all ${isDarkBg ? 'hover:bg-gray-700 hover:text-indigo-300' : 'hover:bg-indigo-50 hover:text-indigo-500'
                }`}
              title="背景设置"
            />
          </Popover>
          {/* 全屏切换 */}
          <Button
            size="small"
            type="text"
            icon={appStore.isBookScreen
              ? <CompressOutlined className={`text-sm ${isDarkBg ? 'text-gray-400' : 'text-gray-400'}`} />
              : <ExpandOutlined className={`text-sm ${isDarkBg ? 'text-gray-400' : 'text-gray-400'}`} />
            }
            onClick={(!appStore.isBookScreen ? appStore.intoBookScreen : appStore.exitBookScreen)}
            className={`rounded-lg transition-all ${isDarkBg ? 'hover:bg-gray-700 hover:text-indigo-300' : 'hover:bg-indigo-50 hover:text-indigo-500'
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
            <div className={`absolute inset-0 ${isDarkBg ? 'bg-black/40' : 'bg-white/70'} backdrop-blur-[1px]`} />
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            className={`w-full h-full bg-transparent border-none outline-none resize-none placeholder-gray-300 selection:bg-indigo-100 relative z-10 ${appStore.isBookScreen ? 'px-12 py-8 max-w-4xl mx-auto' : 'px-8 py-6'
              } ${isDarkBg ? 'text-gray-200 placeholder-gray-600' : 'text-gray-800'}`}
            style={{ ...textareaStyle, color: textareaTextColor }}
            placeholder="开始写作..."
            spellCheck={false}
          />
        </div>
      </div>
      {/* 底部状态栏 */}
      <div className={`px-5 py-1.5 border-t flex items-center justify-between text-[11px] transition-colors duration-200 ${isDarkBg
          ? 'bg-gray-900/60 border-gray-700 text-gray-500 backdrop-blur-sm'
          : 'bg-white/60 border-gray-100 text-gray-400 backdrop-blur-sm'
        }`}>
        <div className="flex items-center gap-3">
          <span className={`px-1.5 py-0.5 rounded ${isDarkBg ? 'bg-gray-800 text-gray-500' : 'bg-gray-50 text-gray-400'}`}>UTF-8</span>
          <span className={`px-1.5 py-0.5 rounded ${isDarkBg ? 'bg-gray-800 text-gray-500' : 'bg-gray-50 text-gray-400'}`}>LF</span>
        </div>
        <div className="flex items-center gap-3">
          <span>行 {lineCount}，列 {column}</span>
          <span className={isDarkBg ? 'text-gray-600' : 'text-gray-200'}>|</span>
          <span>{charCount} 字</span>
        </div>
      </div>
    </div>
  );
};

export default EditorArea;
