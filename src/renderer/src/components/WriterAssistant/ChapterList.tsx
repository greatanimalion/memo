import React from 'react'
import { useWriterStore } from '../../store/useWriterStore'
import { PlusOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'

const ChapterList: React.FC = () => {
  const book = useWriterStore((s) => s.book)
  const currentChapterId = useWriterStore((s) => s.currentChapterId)
  const setCurrentChapter = useWriterStore((s) => s.setCurrentChapter)
  const addChapter = useWriterStore((s) => s.addChapter)
  const deleteChapter = useWriterStore((s) => s.deleteChapter)
  const updateChapterTitle = useWriterStore((s) => s.updateChapterTitle)

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editTitle, setEditTitle] = React.useState('')

  const handleDoubleClick = (id: string, title: string) => {
    setEditingId(id)
    setEditTitle(title)
  }

  const handleTitleSave = (id: string) => {
    if (editTitle.trim()) {
      updateChapterTitle(id, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">章节列表</span>
        <Tooltip title="添加章节">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={addChapter}
          />
        </Tooltip>
      </div>
      <div className="flex-1 overflow-y-auto">
        {book.chapters.map((chapter) => {
          const isActive = chapter.id === currentChapterId
          return (
            <div
              key={chapter.id}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-gray-100 transition-colors ${
                isActive
                  ? 'globalTheme'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => setCurrentChapter(chapter.id)}
            >
              <FileTextOutlined className={`text-sm ${isActive ? 'text-white' : 'text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                {editingId === chapter.id ? (
                  <input
                    className="w-full text-sm px-1 py-0.5 border border-blue-400 rounded outline-none"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleTitleSave(chapter.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTitleSave(chapter.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={`text-sm truncate block ${isActive ? 'text-white' : 'text-gray-700'}`}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      handleDoubleClick(chapter.id, chapter.title)
                    }}
                  >
                    {chapter.title}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                {chapter.wordCount}
              </span>
              {book.chapters.length > 1 && (
                <Tooltip title="删除章节">
                  <DeleteOutlined
                    className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity ${
                      isActive ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteChapter(chapter.id)
                    }}
                  />
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>
      <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400">
        共 {book.chapters.length} 章
      </div>
    </div>
  )
}

export default ChapterList