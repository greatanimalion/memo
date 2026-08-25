import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWriterStore } from '@renderer/store/useWriterStore'
import VirtualTextEditor from '@renderer/components/VirtualTextEditor'
import { AIAssistantPanel } from '@renderer/components/WriterAssistant'

export default function TextEditorPage() {
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('id')
  const currentChapterId = useWriterStore((s) => s.currentChapterId)
  const book = useWriterStore((s) => s.book)
  const loadBookById = useWriterStore((s) => s.loadBookById)
  const saveBook = useWriterStore((s) => s.saveBook)
  const updateChapterContent = useWriterStore((s) => s.updateChapterContent)
  const [fullscreen, setFullscreen] = useState(false)

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f11') {
        e.preventDefault()
        setFullscreen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreen])

  if (fullscreen) {
    return (
      <div className="h-full w-full bg-[#f8f9fb]">
        <VirtualTextEditor
          content={currentChapter?.content || ''}
          onChange={(content) => {
            if (currentChapterId) {
              updateChapterContent(currentChapterId, content)
            }
          }}
          fullscreen
          onToggleFullscreen={() => setFullscreen(false)}
        />
      </div>
    )
  }

  return (
    <div className="h-full w-full flex bg-[#f8f9fb]">
      <VirtualTextEditor
        content={currentChapter?.content || ''}
        onChange={(content) => {
          if (currentChapterId) {
            updateChapterContent(currentChapterId, content)
          }
        }}
        fullscreen={false}
        onToggleFullscreen={() => setFullscreen(true)}
      />
      <AIAssistantPanel />
    </div>
  )
}
