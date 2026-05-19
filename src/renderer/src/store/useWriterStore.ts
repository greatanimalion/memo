import { create } from 'zustand'
import { Book, Chapter, FontFamily } from '../types/common'

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function countWords(text: string, mode: 'chinese' | 'english' = 'chinese'): number {
  if (mode === 'chinese') {
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
    const englishWords = text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length
    return chineseChars + englishWords
  }
  return text.split(/\s+/).filter(Boolean).length
}

function createChapter(title: string, order: number): Chapter {
  const now = Date.now()
  return {
    id: generateUUID(),
    title,
    content: '',
    wordCount: 0,
    order,
    createdAt: now,
    updatedAt: now,
    metadata: {
      aiEnhanced: false,
      tags: [],
      summary: '',
    },
  }
}

function createDefaultBook(): Book {
  return {
    id: generateUUID(),
    title: '未命名作品',
    author: '佚名',
    chapters: [createChapter('第一章', 1)],
    settings: {
      maxChapterWords: 20000,
      wordCountMode: 'chinese',
    },
  }
}

interface WriterState {
  book: Book
  currentChapterId: string | null
  editorSettings: { fontFamily: FontFamily; fontSize: number; lineHeight: number }
  aiPanelOpen: boolean

  setBookTitle: (title: string) => void
  setAuthor: (author: string) => void
  setCurrentChapter: (id: string) => void
  addChapter: () => void
  deleteChapter: (id: string) => void
  reorderChapters: (chapters: Chapter[]) => void
  updateChapterTitle: (id: string, title: string) => void
  updateChapterContent: (id: string, content: string) => void
  setEditorFont: (font: FontFamily) => void
  setEditorFontSize: (size: number) => void
  setEditorLineHeight: (height: number) => void
  toggleAiPanel: () => void
  setAiPanelOpen: (open: boolean) => void
}

export const useWriterStore = create<WriterState>((set) => ({
  book: createDefaultBook(),
  currentChapterId: null,
  editorSettings: {
    fontFamily: 'sans' as FontFamily,
    fontSize: 16,
    lineHeight: 1.8,
  },
  aiPanelOpen: false,

  setBookTitle: (title) =>
    set((state) => ({ book: { ...state.book, title } })),

  setAuthor: (author) =>
    set((state) => ({ book: { ...state.book, author } })),

  setCurrentChapter: (id) => set({ currentChapterId: id }),

  addChapter: () =>
    set((state) => {
      const order = state.book.chapters.length + 1
      const newChapter = createChapter(`第${order}章`, order)
      return {
        book: {
          ...state.book,
          chapters: [...state.book.chapters, newChapter],
        },
        currentChapterId: newChapter.id,
      }
    }),

  deleteChapter: (id) =>
    set((state) => {
      const filtered = state.book.chapters.filter((c) => c.id !== id)
      const reordered = filtered.map((c, i) => ({ ...c, order: i + 1, title: `第${i + 1}章` }))
      const current = state.currentChapterId === id
        ? (reordered[0]?.id || null)
        : state.currentChapterId
      return {
        book: { ...state.book, chapters: reordered },
        currentChapterId: current,
      }
    }),

  reorderChapters: (chapters) =>
    set((state) => ({ book: { ...state.book, chapters } })),

  updateChapterTitle: (id, title) =>
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c
        ),
      },
    })),

  updateChapterContent: (id, content) =>
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === id
            ? {
                ...c,
                content,
                wordCount: countWords(content, state.book.settings.wordCountMode),
                updatedAt: Date.now(),
              }
            : c
        ),
      },
    })),

  setEditorFont: (fontFamily) =>
    set((state) => ({
      editorSettings: { ...state.editorSettings, fontFamily },
    })),

  setEditorFontSize: (fontSize) =>
    set((state) => ({
      editorSettings: { ...state.editorSettings, fontSize },
    })),

  setEditorLineHeight: (lineHeight) =>
    set((state) => ({
      editorSettings: { ...state.editorSettings, lineHeight },
    })),

  toggleAiPanel: () =>
    set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),

  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
}))