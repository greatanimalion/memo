import { BookRepository } from '@main/server/repositories/books.repository';
import type { Book } from '@type/book';

export class BookService {
  private bookRepository: BookRepository;

  constructor() {
    this.bookRepository = new BookRepository();
  }

  getAll(): Book[] {
    return this.bookRepository.getAll();
  }

  getById(id: string): Book | null {
    return this.bookRepository.getById(id) || null;
  }

  create(data: Book): Book {
    return this.bookRepository.create(data);
  }

  update(id: string, data: Partial<Book>): Book | null {
    return this.bookRepository.update(id, data);
  }

  delete(id: string): boolean {
    return this.bookRepository.delete(id);
  }
}