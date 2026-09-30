import api from ".";
import type { Book, BookDetail, Chapter, Volume } from "@type/book";

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

export async function getBooks(): Promise<Book[]> {
  const res = await api.get("/api/books");
  return res.data.data || [];
}

export async function getBookById(id: string): Promise<Book> {
  const res = await api.get(`/api/books/${id}`);
  return res.data.data;
}

export async function getBookDetail(id: string): Promise<BookDetail> {
  const res = await api.get(`/api/books/${id}/detail`);
  return res.data.data;
}

export async function createBook(book: Book): Promise<BookDetail> {
  const res = await api.post("/api/books", book);
  return res.data.data;
}

export async function updateBook(
  id: string,
  data: Partial<Book>,
): Promise<Book> {
  const res = await api.put(`/api/books/${id}`, data);
  return res.data.data;
}

export async function deleteBook(id: string): Promise<void> {
  await api.delete(`/api/books/${id}`);
}

// ========== Chapter ==========

export async function getChapters(bookId: string): Promise<Chapter[]> {
  const res = await api.get(`/api/books/${bookId}/chapters`);
  return res.data.data || [];
}

export async function getChapterById(id: string): Promise<Chapter> {
  const res = await api.get(`/api/chapters/${id}`);
  return res.data.data;
}

export async function createChapter(chapter: Chapter): Promise<Chapter> {
  const res = await api.post("/api/chapters", chapter);
  return res.data.data;
}

export async function updateChapter(
  id: string,
  data: Partial<Chapter>,
): Promise<Chapter> {
  const res = await api.put(`/api/chapters/${id}`, data);
  return res.data.data;
}

export async function deleteChapter(id: string): Promise<void> {
  await api.delete(`/api/chapters/${id}`);
}

// ========== Volume ==========

export async function getVolumes(bookId: string): Promise<Volume[]> {
  const res = await api.get(`/api/books/${bookId}/volumes`);
  return res.data.data || [];
}

export async function getVolumeById(id: string): Promise<Volume> {
  const res = await api.get(`/api/volumes/${id}`);
  return res.data.data;
}

export async function createVolume(volume: Volume): Promise<Volume> {
  const res = await api.post("/api/volumes", volume);
  return res.data.data;
}

export async function updateVolume(
  id: string,
  data: Partial<Volume>,
): Promise<Volume> {
  const res = await api.put(`/api/volumes/${id}`, data);
  return res.data.data;
}

export async function deleteVolume(id: string): Promise<void> {
  await api.delete(`/api/volumes/${id}`);
}
