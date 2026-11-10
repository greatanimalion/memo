import api from ".";
import type { BookAgent } from "@type/book";

export async function getBookAgentsByBookId(bookId: string): Promise<BookAgent[]> {
  const res = await api.get(`/api/books/${bookId}/agents`);
  return res.data.data || [];
}

export async function getBookAgentById(id: string): Promise<BookAgent> {
  const res = await api.get(`/api/book-agents/${id}`);
  return res.data.data;
}

export async function createBookAgent(data: BookAgent): Promise<BookAgent> {
  const res = await api.post("/api/book-agents", data);
  return res.data.data;
}

export async function updateBookAgent(
  id: string,
  data: Partial<BookAgent>,
): Promise<BookAgent> {
  const res = await api.put(`/api/book-agents/${id}`, data);
  return res.data.data;
}

export async function deleteBookAgent(id: string): Promise<void> {
  await api.delete(`/api/book-agents/${id}`);
}

export async function deleteBookAgentsByBookId(bookId: string): Promise<void> {
  await api.delete(`/api/books/${bookId}/agents`);
}
