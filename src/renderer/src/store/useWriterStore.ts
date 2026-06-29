import { create } from "zustand";
import { FontFamily, Chapter, Book, Volume } from "../types/common";
import { generateUUID } from "../utils/helper";
import { getAllBooks, createBook, updateBook } from "../services/book";

function countWords(
  text: string,
  mode: "chinese" | "english" = "chinese",
): number {
  if (mode === "chinese") {
    const chineseChars = (
      text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []
    ).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    return chineseChars + englishWords;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

function createChapter(
  title: string,
  order: number,
  volumeId?: string,
): Chapter {
  const now = Date.now();
  return {
    id: generateUUID(),
    title,
    content: "",
    wordCount: 0,
    order,
    volumeId,
    createdAt: now,
    updatedAt: now,
    metadata: {
      aiEnhanced: false,
      tags: [],
      summary: "",
    },
  };
}

function createVolume(title: string, order: number): Volume {
  return {
    id: generateUUID(),
    title,
    order,
    createdAt: Date.now(),
  };
}

function createDefaultBook(): Book {
  return {
    id: generateUUID(),
    title: "未命名作品",
    author: "佚名",
    cover: "",
    chapters: [createChapter("第1章", 1)],
    volumes: [],
    settings: {
      maxChapterWords: 20000,
      wordCountMode: "chinese",
    },
  };
}

interface WriterState {
  book: Book;
  currentChapterId: string | null;
  editorSettings: {
    fontFamily: FontFamily;
    fontSize: number;
    lineHeight: number;
    fontWeight: number;
  };
  aiPanelOpen: boolean;
  _loaded: boolean;
  _dirty: boolean;

  setBookTitle: (title: string) => void;
  setAuthor: (author: string) => void;
  setCurrentChapter: (id: string) => void;
  addChapter: (volumeId?: string) => void;
  deleteChapter: (id: string) => void;
  reorderChapters: (chapters: Chapter[]) => void;
  updateChapterTitle: (id: string, title: string) => void;
  updateChapterContent: (id: string, content: string) => void;
  addVolume: () => void;
  deleteVolume: (id: string) => void;
  updateVolumeTitle: (id: string, title: string) => void;
  setChapterVolume: (chapterId: string, volumeId: string | undefined) => void;
  setEditorFont: (font: FontFamily) => void;
  setEditorFontSize: (size: number) => void;
  setEditorLineHeight: (height: number) => void;
  setEditorFontWeight: (weight: number) => void;
  toggleAiPanel: () => void;
  setAiPanelOpen: (open: boolean) => void;
  loadBook: () => Promise<void>;
  saveBook: () => Promise<void>;
}

export const useWriterStore = create<WriterState>((set, get) => ({
  book: createDefaultBook(),
  currentChapterId: null,
  editorSettings: {
    fontFamily: "sans" as FontFamily,
    fontSize: 16,
    lineHeight: 1.8,
    fontWeight: 400,
  },
  aiPanelOpen: false,
  _loaded: false,
  _dirty: false,

  setBookTitle: (title) => set((state) => ({ book: { ...state.book, title }, _dirty: true })),

  setAuthor: (author) => set((state) => ({ book: { ...state.book, author }, _dirty: true })),

  setCurrentChapter: (id) => set({ currentChapterId: id }),

  addChapter: (volumeId?: string) =>
    set((state) => {
      const order = state.book.chapters.length + 1;
      const newChapter = createChapter(`第${order}章`, order, volumeId);
      return {
        book: {
          ...state.book,
          chapters: [...state.book.chapters, newChapter],
        },
        currentChapterId: newChapter.id,
        _dirty: true,
      };
    }),

  deleteChapter: (id) =>
    set((state) => {
      const filtered = state.book.chapters.filter((c) => c.id !== id);
      const reordered = filtered.map((c, i) => ({ ...c, order: i + 1 }));
      const current =
        state.currentChapterId === id
          ? reordered[0]?.id || null
          : state.currentChapterId;
      return {
        book: { ...state.book, chapters: reordered },
        currentChapterId: current,
        _dirty: true,
      };
    }),

  addVolume: () =>
    set((state) => {
      const order = state.book.volumes.length + 1;
      const newVolume = createVolume(`第${order}卷`, order);
      return {
        book: {
          ...state.book,
          volumes: [...state.book.volumes, newVolume],
        },
        _dirty: true,
      };
    }),

  deleteVolume: (id) =>
    set((state) => {
      const filtered = state.book.volumes.filter((v) => v.id !== id);
      const reordered = filtered.map((v, i) => ({ ...v, order: i + 1 }));
      return {
        book: {
          ...state.book,
          volumes: reordered,
          chapters: state.book.chapters.map((c) =>
            c.volumeId === id ? { ...c, volumeId: undefined } : c,
          ),
        },
        _dirty: true,
      };
    }),

  updateVolumeTitle: (id, title) =>
    set((state) => ({
      book: {
        ...state.book,
        volumes: state.book.volumes.map((v) =>
          v.id === id ? { ...v, title } : v,
        ),
      },
      _dirty: true,
    })),

  setChapterVolume: (chapterId, volumeId) =>
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === chapterId ? { ...c, volumeId } : c,
        ),
      },
      _dirty: true,
    })),

  reorderChapters: (chapters) =>
    set((state) => ({ book: { ...state.book, chapters }, _dirty: true })),

  updateChapterTitle: (id, title) =>
    set((state) => ({
      book: {
        ...state.book,
        chapters: state.book.chapters.map((c) =>
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
        ),
      },
      _dirty: true,
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
                wordCount: countWords(
                  content,
                  state.book.settings?.wordCountMode || "chinese",
                ),
                updatedAt: Date.now(),
              }
            : c,
        ),
      },
      _dirty: true,
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

  toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),

  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),

  loadBook: async () => {
    const state = get();
    if (state._loaded) return;
    const books = await getAllBooks();
    if (books.length > 0) {
      const existing = books[0];
      set({
        book: existing,
        currentChapterId: existing.chapters[0]?.id || null,
        _loaded: true,
        _dirty: false,
      });
    } else {
      const defaultBook = createDefaultBook();
      const created = await createBook(defaultBook);
      if (created) {
        set({
          book: created,
          currentChapterId: created.chapters[0]?.id || null,
          _loaded: true,
          _dirty: false,
        });
      } else {
        set({
          book: defaultBook,
          currentChapterId: defaultBook.chapters[0]?.id || null,
          _loaded: true,
        });
      }
    }
  },

  saveBook: async () => {
    const { book, _dirty } = get();
    if (!_dirty) return;
    const serverBook = await updateBook(book.id, book);
    if (serverBook) {
      set({ book: serverBook, _dirty: false });
    }
  },
}));
