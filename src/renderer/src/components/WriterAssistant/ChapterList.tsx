import React from "react";
import { useWriterStore } from "@renderer/store/useWriterStore";
import {
  PlusOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";

const ChapterList: React.FC = () => {
  const book = useWriterStore((s) => s.book);
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const setCurrentChapter = useWriterStore((s) => s.setCurrentChapter);
  const addChapter = useWriterStore((s) => s.addChapter);
  const deleteChapter = useWriterStore((s) => s.deleteChapter);
  const updateChapterTitle = useWriterStore((s) => s.updateChapterTitle);
  const addVolume = useWriterStore((s) => s.addVolume);
  const deleteVolume = useWriterStore((s) => s.deleteVolume);
  const updateVolumeTitle = useWriterStore((s) => s.updateVolumeTitle);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [expandedVolumes, setExpandedVolumes] = React.useState<Set<string>>(
    new Set(),
  );

  // 获取未分配到任何卷的章节
  const unassignedChapters = book.chapters.filter((c) => !c.volumeId);

  // 获取某个卷下的章节
  const getChaptersByVolume = (volumeId: string) => {
    return book.chapters.filter((c) => c.volumeId === volumeId);
  };

  const handleDoubleClick = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleTitleSave = (id: string, isVolume: boolean) => {
    if (editTitle.trim()) {
      if (isVolume) {
        updateVolumeTitle(id, editTitle.trim());
      } else {
        updateChapterTitle(id, editTitle.trim());
      }
    }
    setEditingId(null);
  };

  const toggleVolume = (volumeId: string) => {
    const newExpanded = new Set(expandedVolumes);
    if (newExpanded.has(volumeId)) {
      newExpanded.delete(volumeId);
    } else {
      newExpanded.add(volumeId);
    }
    setExpandedVolumes(newExpanded);
  };

  const isVolumeExpanded = (volumeId: string) => expandedVolumes.has(volumeId);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">章节列表</span>
        <div className="flex items-center gap-1">
          <Tooltip title="添加分卷">
            <Button
              type="text"
              size="small"
              icon={<BookOutlined />}
              onClick={addVolume}
            />
          </Tooltip>
          <Tooltip title="添加章节">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => addChapter()}
            />
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* 未分配章节 */}
        {unassignedChapters.length > 0 && (
          <div className="py-2">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
              <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-gray-400" />
              <span>无分卷章节</span>
              <span className="ml-auto text-gray-400">
                {unassignedChapters.length}
              </span>
            </div>
            {unassignedChapters.map((chapter) => {
              const isActive = chapter.id === currentChapterId;
              return (
                <div
                  key={chapter.id}
                  className={`group flex items-center gap-2 px-3 pl-6 py-2 cursor-pointer border-b border-gray-50 transition-colors ${
                    isActive ? "globalTheme" : "hover:bg-gray-50"
                  }`}
                  onClick={() => setCurrentChapter(chapter.id)}
                >
                  <FileTextOutlined
                    className={`text-sm ${isActive ? "text-white" : "text-gray-400"}`}
                  />
                  <div className="flex-1 min-w-0">
                    {editingId === chapter.id ? (
                      <input
                        className="w-full text-sm px-1 py-0.5 border border-blue-400 rounded outline-none"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleTitleSave(chapter.id, false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleTitleSave(chapter.id, false);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className={`text-sm truncate block ${isActive ? "text-white" : "text-gray-700"}`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClick(chapter.id, chapter.title);
                        }}
                      >
                        {chapter.title}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs ${isActive ? "text-white/70" : "text-gray-400"}`}
                  >
                    {chapter.wordCount}
                  </span>
                  {book.chapters.length > 1 && (
                    <Tooltip title="删除章节">
                      <DeleteOutlined
                        className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity ${
                          isActive
                            ? "text-white/70 hover:text-white"
                            : "text-gray-400 hover:text-red-500"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChapter(chapter.id);
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 分卷列表 */}
        {book.volumes.length > 0 && (
          <div className="py-2">
            {book.volumes.map((volume) => {
              const isExpanded = isVolumeExpanded(volume.id);
              const volumeChapters = getChaptersByVolume(volume.id);

              return (
                <div key={volume.id}>
                  {/* 分卷标题 */}
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      isExpanded ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                    onClick={() => toggleVolume(volume.id)}
                  >
                    {isExpanded ? (
                      <FolderOpenOutlined className="w-4 h-4 text-blue-500" />
                    ) : (
                      <FolderOutlined className="w-4 h-4 text-gray-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      {editingId === volume.id ? (
                        <input
                          className="w-full text-sm px-1 py-0.5 border border-blue-400 rounded outline-none bg-transparent"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleTitleSave(volume.id, true)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleTitleSave(volume.id, true);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="text-sm font-medium text-gray-700 truncate block"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleDoubleClick(volume.id, volume.title);
                          }}
                        >
                          {volume.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {volumeChapters.length}
                      </span>
                      <Tooltip title="在本卷添加章节">
                        <PlusOutlined
                          className="w-3 h-3 text-gray-400 hover:text-blue-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            addChapter(volume.id);
                          }}
                        />
                      </Tooltip>
                      {book.volumes.length > 1 && (
                        <Tooltip title="删除分卷">
                          <DeleteOutlined
                            className="w-3 h-3 text-gray-400 hover:text-red-500 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteVolume(volume.id);
                            }}
                          />
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* 分卷下的章节 */}
                  {isExpanded && volumeChapters.length > 0 && (
                    <div className="bg-gray-50/50">
                      {volumeChapters.map((chapter) => {
                        const isActive = chapter.id === currentChapterId;
                        return (
                          <div
                            key={chapter.id}
                            className={`group flex items-center gap-2 px-3 pl-10 py-2 cursor-pointer border-b border-gray-50 transition-colors ${
                              isActive ? "globalTheme" : "hover:bg-gray-50"
                            }`}
                            onClick={() => setCurrentChapter(chapter.id)}
                          >
                            <FileTextOutlined
                              className={`text-sm ${isActive ? "text-white" : "text-gray-400"}`}
                            />
                            <div className="flex-1 min-w-0">
                              {editingId === chapter.id ? (
                                <input
                                  className="w-full text-sm px-1 py-0.5 border border-blue-400 rounded outline-none"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onBlur={() =>
                                    handleTitleSave(chapter.id, false)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleTitleSave(chapter.id, false);
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span
                                  className={`text-sm truncate block ${isActive ? "text-white" : "text-gray-700"}`}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleDoubleClick(
                                      chapter.id,
                                      chapter.title,
                                    );
                                  }}
                                >
                                  {chapter.title}
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-xs ${isActive ? "text-white/70" : "text-gray-400"}`}
                            >
                              {chapter.wordCount}
                            </span>
                            {book.chapters.length > 1 && (
                              <Tooltip title="删除章节">
                                <DeleteOutlined
                                  className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity ${
                                    isActive
                                      ? "text-white/70 hover:text-white"
                                      : "text-gray-400 hover:text-red-500"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteChapter(chapter.id);
                                  }}
                                />
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 空状态 */}
        {book.chapters.length === 0 && book.volumes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <FileTextOutlined className="w-12 h-12 mb-3" />
            <p className="text-sm">暂无章节</p>
            <p className="text-xs mt-1">点击右上角添加章节</p>
          </div>
        )}
      </div>
      <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400">
        共 {book.chapters.length} 章 | {book.volumes.length} 卷
      </div>
    </div>
  );
};

export default ChapterList;
