import React, { useRef, useEffect, useState } from "react";
import { useWriterStore } from "../store/useWriterStore";
import { fontFamilyMap } from "./common/FontSettings";
import { Button, Input } from "antd";
import {
  BookOutlined,
  UserOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { FontSettings, WordCountStats } from "./common";

interface TextEditorProps {
  content: string;
  onChange: (content: string) => void;
  fileName?: string;
}

const TextEditor: React.FC<TextEditorProps> = ({ content, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [column, setColumn] = useState(1);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editingVolumeTitle, setEditingVolumeTitle] = useState("");

  const book = useWriterStore((s) => s.book);
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const setEditorFont = useWriterStore((s) => s.setEditorFont);
  const setEditorFontSize = useWriterStore((s) => s.setEditorFontSize);
  const setEditorLineHeight = useWriterStore((s) => s.setEditorLineHeight);
  const setEditorFontWeight = useWriterStore((s) => s.setEditorFontWeight);
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
    const lines = textBeforeCursor.split("\n");
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
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const tabSpaces = "  ";
      const newText =
        text.substring(0, start) + tabSpaces + text.substring(end);
      onChange(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd =
          start + tabSpaces.length;
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

  const charCount = content.length;

  // 获取当前章节
  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);

  // 获取未分组的章节
  const ungroupedChapters = book.chapters.filter((c) => !c.volumeId);

  // 获取分卷下的章节
  const getChaptersByVolume = (volumeId: string) => {
    return book.chapters.filter((c) => c.volumeId === volumeId);
  };

  // 切换分卷展开状态
  const toggleVolume = (volumeId: string) => {
    setSelectedVolumeId(selectedVolumeId === volumeId ? null : volumeId);
  };

  // 开始编辑分卷名称
  const startEditVolume = (volume: { id: string; title: string }) => {
    setEditingVolumeId(volume.id);
    setEditingVolumeTitle(volume.title);
  };

  // 保存分卷名称
  const saveVolumeTitle = () => {
    if (editingVolumeId && editingVolumeTitle.trim()) {
      updateVolumeTitle(editingVolumeId, editingVolumeTitle.trim());
    }
    setEditingVolumeId(null);
    setEditingVolumeTitle("");
  };

  // 添加章节到分卷
  const handleAddChapter = (volumeId?: string) => {
    addChapter(volumeId);
  };

  return (
    <div className="flex h-full w-full bg-gray-50">
      {/* 左侧：章节/卷管理 */}
      <div className="w-50 overflow-hidden shrink-0 bg-white border-r border-gray-200 flex flex-col max-md:w-0 transition-all duration-300">
        {/* 左侧标题栏 */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOutlined className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">章节管理</span>
          </div>
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined className="w-3 h-3" />}
            onClick={() => handleAddChapter()}
          />
        </div>
        {/* 分卷列表 */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* 未分组章节 */}
          {ungroupedChapters.length > 0 && (
            <div className=" mb-2">
              <div className="text-xs text-gray-400 mb-2 px-1">未分组章节</div>
              {ungroupedChapters.map((chapter) => (
                <div
                  key={chapter.id}
                  onClick={() => setCurrentChapter(chapter.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 pl-[16px]  cursor-pointer transition-colors ${
                    currentChapterId === chapter.id
                      ? "bg-blue-50 text-blue-600"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-sm truncate">{chapter.title}</span>
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
                  <div key={volume.id}>
                    {/* 分卷标题 */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                        isExpanded ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                      onClick={() => toggleVolume(volume.id)}
                    >
                      {isExpanded ? (
                        <FolderOpenOutlined className="w-4 h-4 text-blue-500" />
                      ) : (
                        <FolderOutlined className="w-4 h-4 text-gray-400" />
                      )}
                      {editingVolumeId === volume.id ? (
                        <Input
                          size="small"
                          value={editingVolumeTitle}
                          onChange={(e) =>
                            setEditingVolumeTitle(e.target.value)
                          }
                          onBlur={saveVolumeTitle}
                          onPressEnter={saveVolumeTitle}
                          className="flex-1"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="flex-1 text-sm font-medium text-gray-700 truncate"
                          onDoubleClick={() => startEditVolume(volume)}
                        >
                          {volume.title}
                        </span>
                      )}
                      {editingVolumeId !== volume.id && (
                        <>
                          <Button
                            size="small"
                            type="text"
                            icon={<PlusOutlined className="w-3 h-3" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddChapter(volume.id);
                            }}
                            className="text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                          />
                          <Button
                            size="small"
                            type="text"
                            icon={<DeleteOutlined className="w-3 h-3" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteVolume(volume.id);
                            }}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                          />
                        </>
                      )}
                    </div>
                    {/* 分卷下的章节 */}
                    {isExpanded && volumeChapters.length > 0 && (
                      <div className="bg-gray-50/50">
                        {volumeChapters.map((chapter) => (
                          <div
                            key={chapter.id}
                            onClick={() => setCurrentChapter(chapter.id)}
                            className={`flex items-center gap-2 px-4  py-1.5  cursor-pointer transition-colors ${
                              currentChapterId === chapter.id
                                ? "bg-blue-50 text-blue-600"
                                : "hover:bg-gray-50 text-gray-700"
                            }`}
                          >
                            <span className="text-sm truncate">
                              {chapter.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* 添加新章节按钮 */}
          <div className="px-3 mt-2">
            <Button
              size="small"
              icon={<PlusOutlined className="w-3 h-3" />}
              onClick={addVolume}
              className="w-full border-dashed hover:bg-gray-50"
            >
              新建分卷
            </Button>
          </div>
        </div>
      </div>
      {/* 中间：编辑区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部：标题、时间、字数显示 */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BookOutlined className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {book.title}
            </span>
            <span className="text-gray-300">|</span>
            <UserOutlined className="text-gray-400" />
            <span className="text-sm text-gray-500">{book.author}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{new Date().toLocaleDateString("zh-CN")}</span>
            <span>
              {new Date().toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="bg-blue-50 px-2 py-1 rounded-full text-blue-600">
              {charCount} 字
            </span>
          </div>
        </div>
        {/* 编辑区主体 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 编辑区域 */}
          <div className="flex-1 bg-white overflow-hidden">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              className="w-full h-full bg-white border-none outline-none p-3 text-gray-800 resize-none placeholder-gray-300"
              style={textareaStyle}
              placeholder="请输入内容..."
              spellCheck={false}
            />
          </div>
        </div>
        {/* 底部状态栏 */}
        <div className="px-4 py-2 bg-gray-100 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>UTF-8</span>
            <span>LF</span>
          </div>
          <div>
            行 {lineCount}, 列: {column} | {charCount} 字
          </div>
        </div>
      </div>
      {/* 右侧：设置、章节详情显示 */}
      <div className="w-72 shrink-0 border-l border-gray-200 bg-gray-50/50 overflow-y-auto max-lg:w-0 transition-all duration-300">
        <FontSettings
          fontFamily={editorSettings.fontFamily}
          fontSize={editorSettings.fontSize}
          lineHeight={editorSettings.lineHeight}
          fontWeight={editorSettings.fontWeight}
          onChangeFont={setEditorFont}
          onChangeFontSize={setEditorFontSize}
          onChangeLineHeight={setEditorLineHeight}
          onChangeFontWeight={setEditorFontWeight}
        />

        <WordCountStats content={content} />

        {/* 章节详情 */}
        <div className="p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm font-semibold text-gray-700 mb-3">
              章节详情
            </div>
            {currentChapter ? (
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>章节标题</span>
                  <span className="text-gray-700 font-medium">
                    {currentChapter.title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>章节序号</span>
                  <span className="text-gray-700">{currentChapter.order}</span>
                </div>
                <div className="flex justify-between">
                  <span>所属分卷</span>
                  <span className="text-gray-700">
                    {currentChapter.volumeId
                      ? book.volumes.find(
                          (v) => v.id === currentChapter.volumeId,
                        )?.title || "-"
                      : "未分组"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>创建时间</span>
                  <span className="text-gray-700">
                    {currentChapter.createdAt
                      ? new Date(currentChapter.createdAt).toLocaleString(
                          "zh-CN",
                        )
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>更新时间</span>
                  <span className="text-gray-700">
                    {currentChapter.updatedAt
                      ? new Date(currentChapter.updatedAt).toLocaleString(
                          "zh-CN",
                        )
                      : "-"}
                  </span>
                </div>
                {currentChapter.metadata?.summary && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs text-gray-400 mb-1">AI 摘要</div>
                    <div className="text-xs text-gray-600">
                      {currentChapter.metadata.summary}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400">未选择章节</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextEditor;
