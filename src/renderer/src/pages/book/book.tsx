import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWriterStore } from '@renderer/store/useWriterStore'
import { AIAssistantPanel } from '@renderer/components/WriterAssistant'
import LeftPanel from '@renderer/pages/book/components/LeftPanel'
import EditorArea from '@renderer/pages/book/components/EditorArea'
import RightPanel from '@renderer/pages/book/components/RightPanel'
import useAppStore from '@renderer/store/app'

export default function TextEditorPage() {
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('id')
  const currentChapterId = useWriterStore((s) => s.currentChapterId)
  const book = useWriterStore((s) => s.book)
  const loadBookById = useWriterStore((s) => s.loadBookById)
  const saveBook = useWriterStore((s) => s.saveBook)
  const updateChapterContent = useWriterStore((s) => s.updateChapterContent)
  const appStore = useAppStore()

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId)

  useEffect(() => {
    if (bookId) {
      loadBookById(bookId)
    }
  }, [bookId])

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveBook()
    }, 3000)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [book])

  return (
    <div className="h-full w-full flex">
      <div className='flex h-full w-full'>
        <LeftPanel isBookScreen={appStore.isBookScreen} />
        <EditorArea
          content={currentChapter?.content || ''}
          onChange={(content) => {
            if (currentChapterId) {
              updateChapterContent(currentChapterId, content)
            }
          }}
        />
        <RightPanel content={currentChapter?.content || ''} isBookScreen={appStore.isBookScreen} />
      </div>
      <AIAssistantPanel />
    </div>
  )
}
