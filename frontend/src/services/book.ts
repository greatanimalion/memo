
import api from ".";
import type { Book, BookDetail, Chapter, Volume } from "@type/book";

/** 通用 CRUD 工厂：三套接口完全同构，仅 base 路径与类型不同。 */
function createCrudApi<Item, CreateInput = Partial<Item>, CreateResult = Item>(base: string) {
  return {
    list: async (): Promise<Item[]> => {
      const res = await api.get(base);
      return res.data.data || [];
    },
    get: async (id: string): Promise<Item> => {
      const res = await api.get(`${base}/${id}`);
      return res.data.data;
    },
    create: async (data: CreateInput): Promise<CreateResult> => {
      const res = await api.post(base, data);
      return res.data.data;
    },
    update: async (id: string, data: Partial<Item>): Promise<Item> => {
      const res = await api.put(`${base}/${id}`, data);
      return res.data.data;
    },
    remove: async (id: string): Promise<void> => {
      await api.delete(`${base}/${id}`);
    },
  };
}

// ========== Search ==========

export interface SearchMatch {
  volumeId?: string;
  chapterId: string;
  chapterTitle: string;
  keyword: string;
  context: string;
  position: number;
}

export async function searchBook(
  bookId: string,
  keyword: string,
): Promise<SearchMatch[]> {
  const res = await api.post("/api/book/search", { bookId, keyword });
  return res.data.data || [];
}

// ========== Book ==========

const bookApi = createCrudApi<Book, Book, BookDetail>("/api/books");
export const getBooks = bookApi.list;
export const getBookById = bookApi.get;
export const createBook = bookApi.create;
export const updateBook = bookApi.update;
export const deleteBook = bookApi.remove;

/** 书架详情：books 下单独的 /detail 子路径，属特例。 */
export async function getBookDetail(id: string): Promise<BookDetail> {
  const res = await api.get(`/api/books/${id}/detail`);
  return res.data.data;
}

// ========== Chapter ==========

const chapterApi = createCrudApi<Chapter>("/api/chapters");
export const getChapterById = chapterApi.get;
export const createChapter = chapterApi.create;
export const updateChapter = chapterApi.update;
export const deleteChapter = chapterApi.remove;

/** 某本书的章节列表：嵌套在 book 下，属特例。 */
export async function getChapters(bookId: string): Promise<Chapter[]> {
  const res = await api.get(`/api/books/${bookId}/chapters`);
  return res.data.data || [];
}

/** 把 AI 正文（aiRes）覆盖到 content，并将章节标记为人工内容（isAi=0）。 */
export async function mergeChapterAI(id: string): Promise<Chapter> {
  const res = await api.post(`/api/chapters/${id}/merge-ai`);
  return res.data.data;
}

// ========== Volume ==========

const volumeApi = createCrudApi<Volume>("/api/volumes");
export const getVolumeById = volumeApi.get;
export const createVolume = volumeApi.create;
export const updateVolume = volumeApi.update;
export const deleteVolume = volumeApi.remove;

/** 某本书的卷列表：嵌套在 book 下，属特例。 */
export async function getVolumes(bookId: string): Promise<Volume[]> {
  const res = await api.get(`/api/books/${bookId}/volumes`);
  return res.data.data || [];
}
