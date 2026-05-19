import { useState } from 'react'
import { Button, Input, Tooltip } from 'antd'
import {
  RobotOutlined,
  BookOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useWriterStore } from '../store/useWriterStore'
import {
  ChapterList,
  ChapterEditor,
  ChapterToolbar,
  WordCounter,
  AIAssistantPanel,
} from '../components/WriterAssistant'

export default function TextEditorPage() {
  const book = useWriterStore((s) => s.book)
  const setBookTitle = useWriterStore((s) => s.setBookTitle)
  const setAuthor = useWriterStore((s) => s.setAuthor)
  const aiPanelOpen = useWriterStore((s) => s.aiPanelOpen)
  const toggleAiPanel = useWriterStore((s) => s.toggleAiPanel)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editingAuthor, setEditingAuthor] = useState(false)
  const [titleDraft, setTitleDraft] = useState(book.title)
  const [authorDraft, setAuthorDraft] = useState(book.author)

  const handleSaveTitle = () => {
    if (titleDraft.trim()) {
      setBookTitle(titleDraft.trim())
    } else {
      setTitleDraft(book.title)
    }
    setEditingTitle(false)
  }

  const handleSaveAuthor = () => {
    if (authorDraft.trim()) {
      setAuthor(authorDraft.trim())
    } else {
      setAuthorDraft(book.author)
    }
    setEditingAuthor(false)
  }

  return (
    <div className="h-full w-full flex bg-gray-50">
      <div className="w-60 flex-shrink-0">
        <ChapterList />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="flex items-center gap-3">
            <BookOutlined className="text-gray-400" />
            {editingTitle ? (
              <Input
                size="small"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleSaveTitle}
                onPressEnter={handleSaveTitle}
                className="w-48"
                autoFocus
              />
            ) : (
              <span
                className="text-sm font-medium text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => {
                  setTitleDraft(book.title)
                  setEditingTitle(true)
                }}
              >
                {book.title}
              </span>
            )}

            <span className="text-gray-300">|</span>

            <UserOutlined className="text-gray-400" />
            {editingAuthor ? (
              <Input
                size="small"
                value={authorDraft}
                onChange={(e) => setAuthorDraft(e.target.value)}
                onBlur={handleSaveAuthor}
                onPressEnter={handleSaveAuthor}
                className="w-36"
                autoFocus
              />
            ) : (
              <span
                className="text-sm text-gray-500 cursor-pointer hover:text-blue-600"
                onClick={() => {
                  setAuthorDraft(book.author)
                  setEditingAuthor(true)
                }}
              >
                {book.author}
              </span>
            )}

            <div className="flex-1" />

            <Tooltip title="AI 写作助手">
              <Button
                type={aiPanelOpen ? 'primary' : 'default'}
                size="small"
                icon={<RobotOutlined />}
                onClick={toggleAiPanel}
              >
                AI
              </Button>
            </Tooltip>
          </div>
        </div>

        <ChapterToolbar />

        <div className="flex-1 flex overflow-hidden">
          <ChapterEditor />

          {!aiPanelOpen && (
            <div className="w-64 flex-shrink-0 p-3 overflow-y-auto border-l border-gray-200 bg-gray-50/50 space-y-3">
              <WordCounter />

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">章节信息</div>
                {(() => {
                  const currentChapter = book.chapters.find((c) => c.id === useWriterStore.getState().currentChapterId)
                  if (!currentChapter) {
                    return <div className="text-xs text-gray-400">未选择章节</div>
                  }
                  return (
                    <div className="space-y-2 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>章节标题</span>
                        <span className="text-gray-700 font-medium">{currentChapter.title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>章节序号</span>
                        <span className="text-gray-700">{currentChapter.order}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>创建时间</span>
                        <span className="text-gray-700">
                          {new Date(currentChapter.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>更新时间</span>
                        <span className="text-gray-700">
                          {new Date(currentChapter.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {currentChapter.metadata.summary && (
                        <div className="pt-2 border-t border-gray-100">
                          <div className="text-xs text-gray-400 mb-1">AI 摘要</div>
                          <div className="text-xs text-gray-600">{currentChapter.metadata.summary}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      <AIAssistantPanel />
    </div>
  )
}