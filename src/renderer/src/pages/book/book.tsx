import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWriterStore } from '@renderer/store/useWriterStore'
import { AIAssistantPanel } from '@renderer/components/WriterAssistant'
import LeftPanel from '@renderer/pages/book/components/LeftPanel'
import EditorArea from '@renderer/pages/book/components/EditorArea'
import RightPanel from '@renderer/pages/book/components/RightPanel'
import Bookshelf from '@renderer/pages/book/components/Bookshelf'
import useAppStore from '@renderer/store/app'

export default function TextEditorPage() {
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('id')
  const loadBookById = useWriterStore((s) => s.loadBookById)
  const appStore = useAppStore()

  useEffect(() => {
    if (bookId) {
      loadBookById(bookId)
    }
  }, [bookId])

  if (!bookId) {
    return <Bookshelf />
  }

  return (
    <div className="h-full w-full flex bg-theme-primary">
      <div className='flex h-full w-full'>
        <LeftPanel isBookScreen={appStore.isBookScreen} />
        <EditorArea />
        <RightPanel isBookScreen={appStore.isBookScreen} />
      </div>
      <AIAssistantPanel />
    </div>
  )
}
