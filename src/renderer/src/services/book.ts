import api from '.'
import type { Book } from '../types/common'

export async function getAllBooks(): Promise<Book[]> {
  try {
    const response = await api.get('/api/books')
    return response.data.data
  } catch {
    return []
  }
}

export async function getBookById(id: string): Promise<Book | null> {
  try {
    const response = await api.get('/api/books/' + id)
    return response.data.data
  } catch {
    return null
  }
}

export async function createBook(book: Book): Promise<Book | null> {
  try {
    const response = await api.post('/api/books', book)
    return response.data.data
  } catch {
    return null
  }
}

export async function updateBook(id: string, book: Partial<Book>): Promise<Book | null> {
  try {
    const response = await api.put('/api/books/' + id, book)
    return response.data.data
  } catch {
    return null
  }
}

export async function deleteBook(id: string): Promise<boolean> {
  try {
    const response = await api.delete('/api/books/' + id)
    return response.data.code === 200
  } catch {
    return false
  }
}
