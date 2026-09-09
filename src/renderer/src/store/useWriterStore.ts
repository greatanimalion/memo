import { create } from 'zustand'
import { FontFamily, Chapter, Volume, BookDetail } from '@renderer/types/common'
import {generateUUID} from '@renderer/utils/helper'
import {
  getBookDetail,
  getChapterById,
  updateBook,
  createBook,
  createChapter as apiCreateChapter,
  updateChapter as apiUpdateChapter,
  deleteChapter as apiDeleteChapter,
  createVolume as apiCreateVolume,
  updateVolume as apiUpdateVolume,
  deleteVolume as apiDeleteVolume,
} from '@renderer/services/book'

function countWords(text: string, mode: 'chinese' | 'english'|'all' = 'chinese'): number {
  if (mode === 'chinese') {
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
    const englishWords = text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length
    return chineseChars + englishWords
  }else if(mode==='english'){
    return text.split(/\s+/).filter(Boolean).length
  }
  return text.length
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

const EDITOR_STORAGE_KEY = 'writer-editor-settings'

function loadEditorSettings() {
  try {
    const raw = localStorage.getItem(EDITOR_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function createDefaultBook(): BookDetail {
  const bookId = generateUUID()
  return {
    id: bookId,
    title: '未命名作品',
    cover: '',
    tags: [],
    chapters: [createChapterLocal(bookId, '第1章', 1)],
    volumes: [],
    settings: {
      maxChapterWords: 20000,
      wordCountMode: 'all',
    },
  }
}

interface WriterState {
  book: BookDetail
  currentChapter:Chapter|null
  currentVolume:Volume|null,
  autoSave: boolean
  editorSettings: { fontFamily: FontFamily; fontSize: number; lineHeight: number; fontWeight: number }
  editorBg: { type: 'color'; value: string } | { type: 'image'; value: string } | null
  aiPanelOpen: boolean

  loadBookById: (id: string) => Promise<void>
  saveBook: () => Promise<void>

  saveCurrentChapter: () => Promise<void>

  setAutoSave: (auto: boolean) => void
  setBookTitle: (title: string) => void
  setCurrentChapter: (id: string) => Promise<void>
  addChapter: (volumeId?: string) => Promise<void>
  deleteChapter: (id: string) => Promise<void>
  reorderChapters: (chapters: Chapter[]) => void
  updateChapterTitle: (id: string, title: string) => Promise<void>
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
  currentChapter:null,
  currentChapterId: null,
  currentVolume:null,
  currnetVolumeId:null,
  autoSave: true,
  editorSettings: loadEditorSettings()?.editorSettings ?? {
    fontFamily: 'sans' as FontFamily,
    fontSize: 16,
    lineHeight: 1.8,
    fontWeight: 400,
  },
  editorBg: loadEditorSettings()?.editorBg ?? null,
  aiPanelOpen: false,

  loadBookById: async (id: string) => {
    try {
      const book = await getBookDetail(id)
      set({
        book,
      })
    } catch {
      console.error('加载作品失败')
    }
  },

  saveBook: async () => {
    const { book } = get()
    const bookData = {
      title: book.title,
      cover: book.cover,
      tags: book.tags,
      settings: book.settings,
    }
    try {
      if (book.id) {
        await updateBook(book.id, bookData)
      } else {
        const created = await createBook(book)
        set({ book:created })
      }
    } catch {
      console.error('保存作品失败')
    }
  },

  setAutoSave: (auto) => set({ autoSave: auto }),

  saveCurrentChapter: async () => {
    const {currentChapter } = get()
    if (!currentChapter) return
    if (!currentChapter) return
    try {
      // const wordCount = countWords(currentChapter.content, book.settings?.wordCountMode || 'chinese')
      const wordCount=currentChapter.content.length
      await apiUpdateChapter(currentChapter.id, { content: currentChapter.content, wordCount })
    } catch {
      console.error('保存章节失败')
    }
  },

  setBookTitle: (title) =>
    set((state) => ({ book: { ...state.book, title } })),

  setCurrentChapter: async (id) => {
    try {
      const chapter = await getChapterById(id)
      set({
        currentChapter:chapter,
      })
    } catch {
      console.error('加载章节内容失败')
    }
  },

  addChapter: async (volumeId?: string) => {
    const { book } = get()
    if (!book?.id) return
    const order = book.chapters.length + 1
    const newChapter = createChapterLocal(book.id, `第${order}章`, order, volumeId)
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
      const currentChapter = state.currentChapter?.id === id
        ? (reordered[0]?.id || null)
        : state.currentChapter?.id
      return {
        book: { ...state.book, chapters: reordered },
        currentChapterId: currentChapter,
      }
    })
  },

  addVolume: async () => {
    const { book } = get()
    if (!book.id) return
    const order = book.volumes.length + 1
    const newVolume = createVolumeLocal(book.id, `第${order}卷`, order)
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

  updateChapterTitle: async (id, title) => {
    try {
      await apiUpdateChapter(id, { title })
    } catch {
      console.error('更新章节标题失败')
    }
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c
        ),
      },
    }))
  },

  updateChapterContent: (id, content) => {
    // const wordCount = countWords(content, get().book.settings?.wordCountMode || 'chinese')
    const wordCount = countWords(content, 'chinese')
    if (get().autoSave) {
      apiUpdateChapter(id, { content, wordCount }).catch(() => {
        console.error('保存章节内容失败')
      })
    }
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === id
            ? {
                ...c,
                content,
                wordCount,
                updatedAt: Date.now(),
              }
            : c
        ),
      },currentChapter:{
        ...state.currentChapter!,wordCount:wordCount
      }
    }))
  },

  setEditorFont: (fontFamily) =>
    set((state) => {
      const editorSettings = { ...state.editorSettings, fontFamily }
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({ editorSettings, editorBg: state.editorBg }))
      return { editorSettings }
    }),

  setEditorFontSize: (fontSize) =>
    set((state) => {
      const editorSettings = { ...state.editorSettings, fontSize }
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({ editorSettings, editorBg: state.editorBg }))
      return { editorSettings }
    }),

  setEditorLineHeight: (lineHeight) =>
    set((state) => {
      const editorSettings = { ...state.editorSettings, lineHeight }
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({ editorSettings, editorBg: state.editorBg }))
      return { editorSettings }
    }),

  setEditorFontWeight: (fontWeight) =>
    set((state) => {
      const editorSettings = { ...state.editorSettings, fontWeight }
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({ editorSettings, editorBg: state.editorBg }))
      return { editorSettings }
    }),

  setEditorBg: (editorBg) =>
    set((state) => {
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({ editorSettings: state.editorSettings, editorBg }))
      return { editorBg }
    }),

  toggleAiPanel: () =>
    set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),

  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
}))