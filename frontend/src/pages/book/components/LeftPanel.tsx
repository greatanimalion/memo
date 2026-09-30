import React, { useState } from "react";
import { useWriterStore } from "@renderer/store/useWriterStore";
import { useNavigate } from "react-router-dom";
import { Button, Input, Popconfirm } from "antd";
import {
  PlusOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  DeleteOutlined,
  FileTextOutlined,
  HomeOutlined,
  BorderOuterOutlined,
} from "@ant-design/icons";

interface LeftPanelProps {
  isBookScreen: boolean;
  onOpenBookAgent: () => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  isBookScreen,
  onOpenBookAgent,
}) => {
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editingVolumeTitle, setEditingVolumeTitle] = useState("");
  const navigate = useNavigate();

  const book = useWriterStore((s) => s.book);
  const currentChapter = useWriterStore((s) => s.currentChapter);
  const setCurrentChapter = useWriterStore((s) => s.setCurrentChapter);
  const selectedVolumeId = useWriterStore((s) => s.selectedVolumeId);
  const setSelectedVolumeId = useWriterStore((s) => s.setSelectedVolumeId);
  const addChapter = useWriterStore((s) => s.addChapter);
  const addVolume = useWriterStore((s) => s.addVolume);
  const deleteVolume = useWriterStore((s) => s.deleteVolume);
  const deleteChapter = useWriterStore((s) => s.deleteChapter);
  const updateVolumeTitle = useWriterStore((s) => s.updateVolumeTitle);

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
    setEditingVolumeTitle("");
  };

  const handleAddChapter = (volumeId?: string) => {
    addChapter(volumeId);
  };

  if (isBookScreen) {
    return null;
  }

  return (
    <div className="w-56 shrink-0 border-r border-theme-light flex flex-col bg-theme-primary/70 backdrop-blur-sm max-md:hidden transition-all duration-300">
      {/* 左侧标题栏 */}
      <div className="px-4 py-2.5 border-b border-theme-light flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Button
            type="text"
            size="small"
            icon={<HomeOutlined />}
            onClick={() => navigate("/book")}
            className="text-theme-muted hover:text-accent"
          />
          <span className="text-sm font-semibold text-theme-primary tracking-wide">
             {book.title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="small"
            type="text"
            icon={<BorderOuterOutlined />}
            onClick={onOpenBookAgent}
            className="text-theme-muted hover:text-accent hover:bg-accent-light rounded-lg transition-all"
            title="AI 写书助手"
          />
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined className="text-xs" />}
            onClick={() => handleAddChapter()}
            className="text-theme-muted hover:text-accent hover:bg-accent-light rounded-lg transition-all"
          />
        </div>
      </div>
      {/* 分卷列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {/* 未分组章节 */}
        {ungroupedChapters.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] font-medium text-theme-muted uppercase tracking-wider mb-1.5 px-2">
              未分组
            </div>
            {ungroupedChapters.map((chapter, i) => (
              <div
                key={chapter.id}
                onClick={() => setCurrentChapter(chapter.id)}
                className={`flex items-center gap-2 px-2.5 py-2 mb-0.5 rounded-lg cursor-pointer transition-all duration-150 ${
                  currentChapter?.id === chapter.id
                    ? "bg-accent-light text-accent shadow-theme-sm"
                    : "hover:bg-theme-hover text-theme-secondary hover:text-theme-primary"
                }`}
              >
                <FileTextOutlined
                  className={`text-xs shrink-0 ${
                    currentChapter?.id === chapter.id
                      ? "text-accent"
                      : "text-theme-muted"
                  }`}
                />
                <span className="text-[13px] truncate flex-1">第{1 + i}章</span>
                <span className="text-[10px] text-theme-muted shrink-0">
                  {chapter.wordCount || 0}字
                </span>
                <Popconfirm
                  title="确认删除"
                  description="删除后无法恢复，是否继续？"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    deleteChapter(chapter.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    size="small"
                    type="text"
                    icon={<DeleteOutlined className="text-[10px]" />}
                    onClick={(e) => e.stopPropagation()}
                    className="text-theme-muted hover:text-error hover:bg-error/10 rounded-md w-6 h-6 min-w-0 shrink-0"
                  />
                </Popconfirm>
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
                      isExpanded ? "bg-accent-light/60" : "hover:bg-theme-hover"
                    }`}
                    onClick={() => toggleVolume(volume.id)}
                  >
                    {isExpanded ? (
                      <FolderOpenOutlined className="text-sm text-accent shrink-0" />
                    ) : (
                      <FolderOutlined className="text-sm text-theme-muted shrink-0" />
                    )}
                    {editingVolumeId === volume.id ? (
                      <Input
                        size="small"
                        value={editingVolumeTitle}
                        onChange={(e) => setEditingVolumeTitle(e.target.value)}
                        onBlur={saveVolumeTitle}
                        onPressEnter={saveVolumeTitle}
                        className="flex-1 rounded-md! border-accent-light! text-sm!"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="flex-1 text-[13px] font-medium text-theme-primary truncate"
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
                          className="text-theme-muted hover:text-accent hover:bg-accent-light rounded-md w-6 h-6 min-w-0"
                        />
                        <Popconfirm
                          title="确认删除分卷"
                          description="分卷下的章节将一并移除，删除后无法恢复，是否继续？"
                          onConfirm={(e) => {
                            e?.stopPropagation();
                            deleteVolume(volume.id);
                          }}
                          onCancel={(e) => e?.stopPropagation()}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            size="small"
                            type="text"
                            icon={<DeleteOutlined className="text-[10px]" />}
                            onClick={(e) => e.stopPropagation()}
                            className="text-theme-muted hover:text-error hover:bg-error/10 rounded-md w-6 h-6 min-w-0"
                          />
                        </Popconfirm>
                      </div>
                    )}
                  </div>
                  {/* 分卷下的章节 */}
                  {isExpanded && volumeChapters.length > 0 && (
                    <div className="ml-3 pl-2 border-l border-accent-light mt-0.5">
                      {volumeChapters.map((chapter, i) => (
                        <div
                          key={chapter.id}
                          onClick={() => setCurrentChapter(chapter.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 mb-0.5 rounded-md cursor-pointer transition-all duration-150 ${
                            currentChapter?.id === chapter.id
                              ? "bg-accent-light text-accent"
                              : "hover:bg-theme-hover text-theme-secondary hover:text-theme-primary"
                          }`}
                        >
                          <FileTextOutlined
                            className={`text-[10px] shrink-0 ${
                              currentChapter?.id === chapter.id
                                ? "text-accent"
                                : "text-theme-muted"
                            }`}
                          />
                          <span className="text-[13px] truncate flex-1">
                            第{i + 1}章
                          </span>
                          <span className="text-[10px] text-theme-muted shrink-0">
                            {chapter.wordCount || 0}字
                          </span>
                          <Popconfirm
                            title="确认删除"
                            description="删除后无法恢复，是否继续？"
                            onConfirm={(e) => {
                              e?.stopPropagation();
                              deleteChapter(chapter.id);
                            }}
                            onCancel={(e) => e?.stopPropagation()}
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              size="small"
                              type="text"
                              icon={<DeleteOutlined className="text-[10px]" />}
                              onClick={(e) => e.stopPropagation()}
                              className="text-theme-muted hover:text-error hover:bg-error/10 rounded-md w-6 h-6 min-w-0 shrink-0"
                            />
                          </Popconfirm>
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
            className="w-full border-dashed border-theme-light hover:border-accent hover:bg-accent-light/50 hover:text-accent text-theme-muted rounded-lg transition-all"
          >
            新建分卷
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LeftPanel;
