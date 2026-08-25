import React, { useRef, useEffect, useState } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { fontFamilyMap } from './WriterAssistant/ChapterToolbar';
import { Select, Slider, Button, Input, Popover } from 'antd';
import {
  FontSizeOutlined,
  ColumnHeightOutlined,
  FontColorsOutlined,
  BoldOutlined,
  BookOutlined,
  UserOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  DeleteOutlined,
  FileTextOutlined,
  BarChartOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  ExpandOutlined,
  CompressOutlined,
  BgColorsOutlined,
  PictureOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { FontFamily } from '../types/common';

interface TextEditorProps {
  content: string;
  onChange: (content: string) => void;
  fileName?: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const fontOptions: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: '无衬线' },
  { value: 'serif', label: '衬线体' },
  { value: 'mono', label: '等宽体' },
  { value: 'kaiti', label: '楷体' },
  { value: 'songti', label: '宋体' },
];

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

const TextEditor: React.FC<TextEditorProps> = ({ content, onChange, fullscreen = false, onToggleFullscreen }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [column, setColumn] = useState(1);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editingVolumeTitle, setEditingVolumeTitle] = useState('');

  const book = useWriterStore((s) => s.book);
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const editorBg = useWriterStore((s) => s.editorBg);
  const setEditorFont = useWriterStore((s) => s.setEditorFont);
  const setEditorFontSize = useWriterStore((s) => s.setEditorFontSize);
  const setEditorLineHeight = useWriterStore((s) => s.setEditorLineHeight);
  const setEditorFontWeight = useWriterStore((s) => s.setEditorFontWeight);
  const setEditorBg = useWriterStore((s) => s.setEditorBg);
  const setCurrentChapter = useWriterStore((s) => s.setCurrentChapter);
  const addChapter = useWriterStore((s) => s.addChapter);
  const addVolume = useWriterStore((s) => s.addVolume);
  const deleteVolume = useWriterStore((s) => s.deleteVolume);
  const updateVolumeTitle = useWriterStore((s) => s.updateVolumeTitle);
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
  const chineseChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const englishWords = content
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const paragraphCount = content.split(/\n\n+/).filter(p => p.trim()).length;
  const sentenceCount = (content.match(/[.!?。！？]+/g) || []).length || (content.trim() ? 1 : 0);

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);
  const ungroupedChapters = book.chapters.filter((c) => !c.volumeId);

  const getChaptersByVolume = (volumeId: string) => {
    return book.chapters.filter((c) => c.volumeId === volumeId);
  };

  const toggleVolume = (volumeId: string) => {
    setSelectedVolumeId(selectedVolumeId === volumeId ? null : volumeId);
  };

  const startEditVolume = (volume: { id: string; title: string }) => {
    setEditingVolumeId(volume.id);
    setEditingVolumeTitle(volume.title);
  };

  const saveVolumeTitle = () => {
    if (editingVolumeId && editingVolumeTitle.trim()) {
      updateVolumeTitle(editingVolumeId, editingVolumeTitle.trim());
    }
    setEditingVolumeId(null);
    setEditingVolumeTitle('');
  };

  const handleAddChapter = (volumeId?: string) => {
    addChapter(volumeId);
  };

  const bgPopoverContent = (
    <div className="w-56">
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">颜色预设</div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {bgPresets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => setEditorBg({ type: 'color', value: preset.value })}
            className={`group relative w-full aspect-square rounded-lg border-2 transition-all hover:scale-105 ${
              editorBg?.type === 'color' && editorBg.value === preset.value
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
    <div className={`flex h-full w-full ${fullscreen ? '' : 'bg-[#f8f9fb]'}`}>
      {/* 左侧：章节/卷管理 */}
      {!fullscreen && (
        <div className="w-56 shrink-0 border-r border-gray-200/80 flex flex-col bg-white/70 backdrop-blur-sm max-md:w-0 transition-all duration-300">
          {/* 左侧标题栏 */}
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <BookOutlined className="text-white text-xs" />
              </div>
              <span className="text-sm font-semibold text-gray-800 tracking-wide">章节管理</span>
            </div>
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined className="text-xs" />}
              onClick={() => handleAddChapter()}
              className="text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
            />
          </div>
          {/* 分卷列表 */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {/* 未分组章节 */}
            {ungroupedChapters.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 px-2">未分组</div>
                {ungroupedChapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    onClick={() => setCurrentChapter(chapter.id)}
                    className={`flex items-center gap-2 px-2.5 py-2 mb-0.5 rounded-lg cursor-pointer transition-all duration-150 ${
                      currentChapterId === chapter.id
                        ? 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100'
                        : 'hover:bg-gray-50 text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <FileTextOutlined className={`text-xs shrink-0 ${
                      currentChapterId === chapter.id ? 'text-indigo-400' : 'text-gray-300'
                    }`} />
                    <span className="text-[13px] truncate">{chapter.title}</span>
                  </div>
                ))}
              </div>
            )}
            {/* 分卷 */}
            {book.volumes.length > 0 && (
              <div>
                {book.volumes.map((volume) => {
                  const isExpanded = selectedVolumeId === volume.id;
                  const volumeChapters = getChaptersByVolume(volume.id);
                  return (
                    <div key={volume.id} className="mb-1">
                      {/* 分卷标题 */}
                      <div
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                          isExpanded ? 'bg-indigo-50/60' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => toggleVolume(volume.id)}
                      >
                        {isExpanded ? (
                          <FolderOpenOutlined className="text-sm text-indigo-400 shrink-0" />
                        ) : (
                          <FolderOutlined className="text-sm text-gray-300 shrink-0" />
                        )}
                        {editingVolumeId === volume.id ? (
                          <Input
                            size="small"
                            value={editingVolumeTitle}
                            onChange={(e) => setEditingVolumeTitle(e.target.value)}
                            onBlur={saveVolumeTitle}
                            onPressEnter={saveVolumeTitle}
                            className="flex-1 !rounded-md !border-indigo-200 !text-sm"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="flex-1 text-[13px] font-medium text-gray-700 truncate"
                            onDoubleClick={() => startEditVolume(volume)}
                          >
                            {volume.title}
                          </span>
                        )}
                        {editingVolumeId !== volume.id && (
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="small"
                              type="text"
                              icon={<PlusOutlined className="text-[10px]" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddChapter(volume.id);
                              }}
                              className="text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-md w-6 h-6 min-w-0"
                            />
                            <Button
                              size="small"
                              type="text"
                              icon={<DeleteOutlined className="text-[10px]" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteVolume(volume.id);
                              }}
                              className="text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-md w-6 h-6 min-w-0"
                            />
                          </div>
                        )}
                      </div>
                      {/* 分卷下的章节 */}
                      {isExpanded && volumeChapters.length > 0 && (
                        <div className="ml-3 pl-2 border-l border-indigo-100/60 mt-0.5">
                          {volumeChapters.map((chapter) => (
                            <div
                              key={chapter.id}
                              onClick={() => setCurrentChapter(chapter.id)}
                              className={`flex items-center gap-2 px-2.5 py-1.5 mb-0.5 rounded-md cursor-pointer transition-all duration-150 ${
                                currentChapterId === chapter.id
                                  ? 'bg-indigo-50 text-indigo-600'
                                  : 'hover:bg-gray-50 text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              <FileTextOutlined className={`text-[10px] shrink-0 ${
                                currentChapterId === chapter.id ? 'text-indigo-400' : 'text-gray-300'
                              }`} />
                              <span className="text-[13px] truncate">{chapter.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* 添加新分卷按钮 */}
            <div className="px-2 mt-3">
              <Button
                size="small"
                icon={<PlusOutlined className="text-xs" />}
                onClick={addVolume}
                className="w-full border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-500 text-gray-400 rounded-lg transition-all"
              >
                新建分卷
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 中间：编辑区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部信息栏 */}
        <div className={`flex items-center justify-between px-5 py-2.5 border-b transition-colors duration-200 ${
          fullscreen
            ? isDarkBg
              ? 'bg-gray-900/80 border-gray-700 backdrop-blur-sm'
              : 'bg-white/60 border-gray-100 backdrop-blur-sm'
            : 'bg-white/80 border-gray-100 backdrop-blur-sm'
        }`}>
          <div className="flex items-center gap-3">
            {!fullscreen && (
              <>
                <div className="flex items-center gap-2">
                  <BookOutlined className={`text-sm ${isDarkBg ? 'text-indigo-300' : 'text-indigo-400'}`} />
                  <span className={`text-sm font-semibold ${isDarkBg ? 'text-gray-200' : 'text-gray-800'}`}>{book.title}</span>
                </div>
                <div className={`w-px h-3.5 ${isDarkBg ? 'bg-gray-600' : 'bg-gray-200'}`} />
                <div className="flex items-center gap-1.5">
                  <UserOutlined className={`text-xs ${isDarkBg ? 'text-gray-500' : 'text-gray-300'}`} />
                  <span className={`text-[13px] ${isDarkBg ? 'text-gray-400' : 'text-gray-500'}`}>{book.author}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!fullscreen && (
              <div className={`flex items-center gap-3 text-[12px] mr-2 ${isDarkBg ? 'text-gray-500' : 'text-gray-400'}`}>
                <span>{new Date().toLocaleDateString('zh-CN')}</span>
                <span className={isDarkBg ? 'text-gray-600' : 'text-gray-200'}>·</span>
                <span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={`px-2.5 py-0.5 rounded-full font-medium ${
                  isDarkBg ? 'bg-gray-800 text-indigo-300' : 'bg-indigo-50 text-indigo-500'
                }`}>
                  {charCount} 字
                </span>
              </div>
            )}
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
                className={`rounded-lg transition-all ${
                  isDarkBg ? 'hover:bg-gray-700 hover:text-indigo-300' : 'hover:bg-indigo-50 hover:text-indigo-500'
                }`}
                title="背景设置"
              />
            </Popover>
            {/* 全屏切换 */}
            {onToggleFullscreen && (
              <Button
                size="small"
                type="text"
                icon={fullscreen
                  ? <CompressOutlined className={`text-sm ${isDarkBg ? 'text-gray-400' : 'text-gray-400'}`} />
                  : <ExpandOutlined className={`text-sm ${isDarkBg ? 'text-gray-400' : 'text-gray-400'}`} />
                }
                onClick={onToggleFullscreen}
                className={`rounded-lg transition-all ${
                  isDarkBg ? 'hover:bg-gray-700 hover:text-indigo-300' : 'hover:bg-indigo-50 hover:text-indigo-500'
                }`}
                title={fullscreen ? '退出全屏 (Esc)' : '全屏编辑 (Ctrl+F11)'}
              />
            )}
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
              className={`w-full h-full bg-transparent border-none outline-none resize-none placeholder-gray-300 selection:bg-indigo-100 relative z-10 ${
                fullscreen ? 'px-12 py-8 max-w-4xl mx-auto' : 'px-8 py-6'
              } ${isDarkBg ? 'text-gray-200 placeholder-gray-600' : 'text-gray-800'}`}
              style={{ ...textareaStyle, color: textareaTextColor }}
              placeholder="开始写作..."
              spellCheck={false}
            />
          </div>
        </div>
        {/* 底部状态栏 */}
        <div className={`px-5 py-1.5 border-t flex items-center justify-between text-[11px] transition-colors duration-200 ${
          isDarkBg
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
      {/* 右侧：设置面板 */}
      {!fullscreen && (
        <div className="w-64 shrink-0 border-l border-gray-200/80 bg-white/70 backdrop-blur-sm overflow-y-auto max-lg:w-0 transition-all duration-300">
          {/* 字体设置 */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <SettingOutlined className="text-indigo-400 text-sm" />
              <span className="text-sm font-semibold text-gray-700">字体设置</span>
            </div>
            
            {/* 字体选择 */}
            <div className="mb-4">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">字体</label>
              <div className="flex items-center gap-2">
                <FontColorsOutlined className="text-gray-300 text-sm" />
                <Select
                  size="small"
                  value={editorSettings.fontFamily}
                  onChange={setEditorFont}
                  options={fontOptions}
                  className="flex-1"
                />
              </div>
            </div>
            
            {/* 字号设置 */}
            <div className="mb-4">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">字号</label>
              <div className="flex items-center gap-2">
                <FontSizeOutlined className="text-gray-300 text-sm" />
                <Slider
                  className="flex-1"
                  min={12}
                  max={30}
                  value={editorSettings.fontSize}
                  onChange={setEditorFontSize}
                  tooltip={{ formatter: (v) => `${v}px` }}
                />
                <span className="text-[11px] text-gray-500 w-8 text-right font-medium tabular-nums">{editorSettings.fontSize}px</span>
              </div>
            </div>
            
            {/* 行间距设置 */}
            <div className="mb-4">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">行距</label>
              <div className="flex items-center gap-2">
                <ColumnHeightOutlined className="text-gray-300 text-sm" />
                <Slider
                  className="flex-1"
                  min={1.2}
                  max={2.5}
                  step={0.1}
                  value={editorSettings.lineHeight}
                  onChange={setEditorLineHeight}
                  tooltip={{ formatter: (v) => `${v}` }}
                />
                <span className="text-[11px] text-gray-500 w-6 text-right font-medium tabular-nums">{editorSettings.lineHeight}</span>
              </div>
            </div>
            
            {/* 字体粗细设置 */}
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">粗细</label>
              <div className="flex items-center gap-2">
                <BoldOutlined className="text-gray-300 text-sm" />
                <Slider
                  className="flex-1"
                  min={100}
                  max={900}
                  step={100}
                  value={editorSettings.fontWeight}
                  onChange={setEditorFontWeight}
                  tooltip={{ formatter: (v) => `${v}` }}
                />
                <span className="text-[11px] text-gray-500 w-8 text-right font-medium tabular-nums">{editorSettings.fontWeight}</span>
              </div>
            </div>
          </div>

          {/* 字数统计 */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <BarChartOutlined className="text-indigo-400 text-sm" />
              <span className="text-sm font-semibold text-gray-700">字数统计</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '总字符', value: charCount },
                { label: '中文', value: chineseChars },
                { label: '英文词', value: englishWords },
                { label: '段落', value: paragraphCount },
                { label: '句子', value: sentenceCount },
                { label: '行数', value: content.split('\n').length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-gray-50/80 rounded-lg p-2.5 hover:bg-gray-100/80 transition-colors"
                >
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{stat.label}</div>
                  <div className="text-lg font-bold text-gray-700 mt-0.5 tabular-nums">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 章节详情 */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <InfoCircleOutlined className="text-indigo-400 text-sm" />
              <span className="text-sm font-semibold text-gray-700">章节详情</span>
            </div>
            {currentChapter ? (
              <div className="bg-gray-50/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">标题</span>
                  <span className="text-[12px] text-gray-700 font-medium truncate ml-2 max-w-[140px]">{currentChapter.title}</span>
                </div>
                <div className="w-full h-px bg-gray-100" />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">序号</span>
                  <span className="text-[12px] text-gray-600 tabular-nums">{currentChapter.order}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">分卷</span>
                  <span className="text-[12px] text-gray-600 truncate ml-2 max-w-[140px]">
                    {currentChapter.volumeId
                      ? book.volumes.find((v) => v.id === currentChapter.volumeId)?.title || '-'
                      : '未分组'}
                  </span>
                </div>
                <div className="w-full h-px bg-gray-100" />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">创建</span>
                  <span className="text-[12px] text-gray-600 tabular-nums">
                    {currentChapter.createdAt
                      ? new Date(currentChapter.createdAt).toLocaleString('zh-CN')
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">更新</span>
                  <span className="text-[12px] text-gray-600 tabular-nums">
                    {currentChapter.updatedAt
                      ? new Date(currentChapter.updatedAt).toLocaleString('zh-CN')
                      : '-'}
                  </span>
                </div>
                {currentChapter.metadata?.summary && (
                  <>
                    <div className="w-full h-px bg-gray-100" />
                    <div>
                      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">AI 摘要</div>
                      <div className="text-[11px] text-gray-500 leading-relaxed">{currentChapter.metadata.summary}</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-gray-50/80 rounded-xl p-4 text-center">
                <FileTextOutlined className="text-2xl text-gray-200 mb-2" />
                <div className="text-[11px] text-gray-400">未选择章节</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TextEditor;
