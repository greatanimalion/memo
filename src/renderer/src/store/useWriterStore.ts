﻿import { create } from 'zustand'
import { FontFamily, Chapter, Book, Volume } from '@renderer/types/common'
import {generateUUID} from '@renderer/utils/helper'
import { getBookById, updateBook, createBook } from '@renderer/services/book'

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

function createChapter(title: string, order: number, volumeId?: string): Chapter {
  const now = Date.now()
  return {
    id: generateUUID(),
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

function createVolume(title: string, order: number): Volume {
  return {
    id: generateUUID(),
    title,
    order,
    createdAt: Date.now(),
  }
}

function createDefaultBook(): Book {
  return {
    id: generateUUID(),
    title: '未命名作品',
    author: '佚名',
    cover: '',
    chapters: [createChapter('第1章', 1)],
    volumes: [],
    settings: {
      maxChapterWords: 20000,
      wordCountMode: 'chinese',
    },
  }
}

interface WriterState {
  book: Book
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
  addChapter: (volumeId?: string) => void
  deleteChapter: (id: string) => void
  reorderChapters: (chapters: Chapter[]) => void
  updateChapterTitle: (id: string, title: string) => void
  updateChapterContent: (id: string, content: string) => void
  addVolume: () => void
  deleteVolume: (id: string) => void
  updateVolumeTitle: (id: string, title: string) => void
  setChapterVolume: (chapterId: string, volumeId: string | undefined) => void
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
      const book = await getBookById(id)
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
      if (bookId) {
        await updateBook(bookId, book)
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

  addChapter: (volumeId?: string) =>
    set((state) => {
      const order = state.book.chapters.length + 1
      const newChapter = createChapter(`第${order}章`, order, volumeId)
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
      const reordered = filtered.map((c, i) => ({ ...c, order: i + 1 }))
      const current = state.currentChapterId === id
        ? (reordered[0]?.id || null)
        : state.currentChapterId
      return {
        book: { ...state.book, chapters: reordered },
        currentChapterId: current,
      }
    }),

  addVolume: () =>
    set((state) => {
      const order = state.book.volumes.length + 1
      const newVolume = createVolume(`第${order}卷`, order)
      return {
        book: {
          ...state.book,
          volumes: [...state.book.volumes, newVolume],
        },
      }
    }),

  deleteVolume: (id) =>
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
    }),

  updateVolumeTitle: (id, title) =>
    set((state) => ({
      book: {
        ...state.book,
        volumes: state.book.volumes.map((v) =>
          v.id === id ? { ...v, title } : v
        ),
      },
    })),

  setChapterVolume: (chapterId, volumeId) =>
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === chapterId ? { ...c, volumeId } : c
        ),
      },
    })),

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