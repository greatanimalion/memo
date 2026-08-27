import { create } from 'zustand'
import { FontFamily, Chapter, Volume, BookDetail } from '@renderer/types/common'
import {generateUUID} from '@renderer/utils/helper'
import {
  getBookDetail,
  updateBook,
  createBook,
  createChapter as apiCreateChapter,
  updateChapter as apiUpdateChapter,
  deleteChapter as apiDeleteChapter,
  createVolume as apiCreateVolume,
  updateVolume as apiUpdateVolume,
  deleteVolume as apiDeleteVolume,
} from '@renderer/services/book'

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

function createChapterLocal(bookId: string, title: string, order: number, volumeId?: string): Chapter {
  const now = Date.now()
  return {
    id: generateUUID(),
    bookId,
    title,
    content: '',
    wordCount: 0,
    order,
    volumeId,
    createdAt: now,
    updatedAt: now,
    metadata: {
      aiEnhanced: false,
      tags: [],
      summary: '',
    },
  }
}

function createVolumeLocal(bookId: string, title: string, order: number): Volume {
  return {
    id: generateUUID(),
    bookId,
    title,
    order,
    createdAt: Date.now(),
  }
}

function createDefaultBook(): BookDetail {
  const bookId = generateUUID()
  return {
    id: bookId,
    title: '未命名作品',
    author: '佚名',
    cover: '',
    tags: [],
    chapters: [createChapterLocal(bookId, '第1章', 1)],
    volumes: [],
    settings: {
      maxChapterWords: 20000,
      wordCountMode: 'chinese',
    },
  }
}

interface WriterState {
  book: BookDetail
  bookId: string | null
  currentChapterId: string | null
  editorSettings: { fontFamily: FontFamily; fontSize: number; lineHeight: number; fontWeight: number }
  editorBg: { type: 'color'; value: string } | { type: 'image'; value: string } | null
  aiPanelOpen: boolean

  loadBookById: (id: string) => Promise<void>
  saveBook: () => Promise<void>
  setBookTitle: (title: string) => void
  setAuthor: (author: string) => void
  setCurrentChapter: (id: string) => void
  addChapter: (volumeId?: string) => Promise<void>
  deleteChapter: (id: string) => Promise<void>
  reorderChapters: (chapters: Chapter[]) => void
  updateChapterTitle: (id: string, title: string) => void
  updateChapterContent: (id: string, content: string) => void
  addVolume: () => Promise<void>
  deleteVolume: (id: string) => Promise<void>
  updateVolumeTitle: (id: string, title: string) => Promise<void>
  setChapterVolume: (chapterId: string, volumeId: string | undefined) => Promise<void>
  setEditorFont: (font: FontFamily) => void
  setEditorFontSize: (size: number) => void
  setEditorLineHeight: (height: number) => void
  setEditorFontWeight: (weight: number) => void
  setEditorBg: (bg: { type: 'color'; value: string } | { type: 'image'; value: string } | null) => void
  toggleAiPanel: () => void
  setAiPanelOpen: (open: boolean) => void
}

export const useWriterStore = create<WriterState>((set, get) => ({
  book: createDefaultBook(),
  bookId: null,
  currentChapterId: null,
  editorSettings: {
    fontFamily: 'sans' as FontFamily,
    fontSize: 16,
    lineHeight: 1.8,
    fontWeight: 400,
  },
  editorBg: null,
  aiPanelOpen: false,

  loadBookById: async (id: string) => {
    try {
      const book = await getBookDetail(id)
      set({
        book,
        bookId: id,
        currentChapterId: book.chapters[0]?.id || null,
      })
    } catch {
      console.error('加载作品失败')
    }
  },

  saveBook: async () => {
    const { book, bookId } = get()
    try {
      const bookData = {
        title: book.title,
        author: book.author,
        cover: book.cover,
        tags: book.tags,
        settings: book.settings,
      }
      if (bookId) {
        await updateBook(bookId, bookData)
      } else {
        const created = await createBook(book)
        set({ bookId: created.id })
      }
    } catch {
      console.error('保存作品失败')
    }
  },

  setBookTitle: (title) =>
    set((state) => ({ book: { ...state.book, title } })),

  setAuthor: (author) =>
    set((state) => ({ book: { ...state.book, author } })),

  setCurrentChapter: (id) => set({ currentChapterId: id }),

  addChapter: async (volumeId?: string) => {
    const { book, bookId } = get()
    if (!bookId) return
    const order = book.chapters.length + 1
    const newChapter = createChapterLocal(bookId, `第${order}章`, order, volumeId)
    try {
      await apiCreateChapter(newChapter)
    } catch {
      console.error('创建章节失败')
    }
    set((state) => ({
      book: {
        ...state.book,
        chapters: [...state.book.chapters, newChapter],
      },
      currentChapterId: newChapter.id,
    }))
  },

  deleteChapter: async (id) => {
    try {
      await apiDeleteChapter(id)
    } catch {
      console.error('删除章节失败')
    }
    set((state) => {
      const filtered = state.book.chapters.filter((c) => c.id !== id)
      const reordered = filtered.map((c, i) => ({ ...c, order: i + 1 }))
      const current = state.currentChapterId === id
        ? (reordered[0]?.id || null)
        : state.currentChapterId
      return {
        book: { ...state.book, chapters: reordered },
        currentChapterId: current,
      }
    })
  },

  addVolume: async () => {
    const { book, bookId } = get()
    if (!bookId) return
    const order = book.volumes.length + 1
    const newVolume = createVolumeLocal(bookId, `第${order}卷`, order)
    try {
      await apiCreateVolume(newVolume)
    } catch {
      console.error('创建分卷失败')
    }
    set((state) => ({
      book: {
        ...state.book,
        volumes: [...state.book.volumes, newVolume],
      },
    }))
  },

  deleteVolume: async (id) => {
    try {
      await apiDeleteVolume(id)
    } catch {
      console.error('删除分卷失败')
    }
    set((state) => {
      const filtered = state.book.volumes.filter((v) => v.id !== id)
      const reordered = filtered.map((v, i) => ({ ...v, order: i + 1 }))
      return {
        book: {
          ...state.book,
          volumes: reordered,
          chapters: state.book.chapters.map((c) =>
            c.volumeId === id ? { ...c, volumeId: undefined } : c
          ),
        },
      }
    })
  },

  updateVolumeTitle: async (id, title) => {
    try {
      await apiUpdateVolume(id, { title })
    } catch {
      console.error('更新分卷标题失败')
    }
    set((state) => ({
      book: {
        ...state.book,
        volumes: state.book.volumes.map((v) =>
          v.id === id ? { ...v, title } : v
        ),
      },
    }))
  },

  setChapterVolume: async (chapterId, volumeId) => {
    try {
      await apiUpdateChapter(chapterId, { volumeId })
    } catch {
      console.error('更新章节分卷失败')
    }
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === chapterId ? { ...c, volumeId } : c
        ),
      },
    }))
  },

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
                wordCount: countWords(content, state.book.settings?.wordCountMode || 'chinese'),
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

  setEditorFontWeight: (fontWeight) =>
    set((state) => ({
      editorSettings: { ...state.editorSettings, fontWeight },
    })),

  setEditorBg: (editorBg) => set({ editorBg }),

  toggleAiPanel: () =>
    set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),

  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
}))