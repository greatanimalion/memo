import api from ".";
import type { Book } from "@type/book";

export async function getBooks(): Promise<Book[]> {
  const res = await api.get("/api/books");
  return res.data.data || [];
}

export async function getBookById(id: string): Promise<Book> {
  const res = await api.get(`/api/books/${id}`);
  return res.data.data;
}

export async function createBook(book: Book): Promise<Book> {
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
