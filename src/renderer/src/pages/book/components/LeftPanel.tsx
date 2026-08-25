import React, { useState } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { Button, Input } from 'antd';
import {
  PlusOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  DeleteOutlined,
  FileTextOutlined,
} from '@ant-design/icons';

interface LeftPanelProps {
  isBookScreen: boolean;
}

const LeftPanel: React.FC<LeftPanelProps> = ({ isBookScreen }) => {
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editingVolumeTitle, setEditingVolumeTitle] = useState('');

  const book = useWriterStore((s) => s.book);
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const setCurrentChapter = useWriterStore((s) => s.setCurrentChapter);
  const addChapter = useWriterStore((s) => s.addChapter);
  const addVolume = useWriterStore((s) => s.addVolume);
  const deleteVolume = useWriterStore((s) => s.deleteVolume);
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
    setEditingVolumeTitle('');
  };

  const handleAddChapter = (volumeId?: string) => {
    addChapter(volumeId);
  };

  if (isBookScreen) {
    return null;
  }

  return (
    <div className="w-56 shrink-0 border-r border-gray-200/80 flex flex-col bg-white/70 backdrop-blur-sm max-md:w-0 transition-all duration-300">
      {/* 左侧标题栏 */}
      <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
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
                className={`flex items-center gap-2 px-2.5 py-2 mb-0.5 rounded-lg cursor-pointer transition-all duration-150 ${currentChapterId === chapter.id
                    ? 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100'
                    : 'hover:bg-gray-50 text-gray-600 hover:text-gray-800'
                  }`}
              >
                <FileTextOutlined className={`text-xs shrink-0 ${currentChapterId === chapter.id ? 'text-indigo-400' : 'text-gray-300'
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
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${isExpanded ? 'bg-indigo-50/60' : 'hover:bg-gray-50'
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
                        className="flex-1 rounded-md! border-indigo-200! text-sm!"
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
                          className={`flex items-center gap-2 px-2.5 py-1.5 mb-0.5 rounded-md cursor-pointer transition-all duration-150 ${currentChapterId === chapter.id
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'hover:bg-gray-50 text-gray-500 hover:text-gray-700'
                            }`}
                        >
                          <FileTextOutlined className={`text-[10px] shrink-0 ${currentChapterId === chapter.id ? 'text-indigo-400' : 'text-gray-300'
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
  );
};

export default LeftPanel;
