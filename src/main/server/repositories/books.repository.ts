import { DatabaseHelper } from '@main/server/db';
import type { Book } from '@type/book';

export class BookRepository {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getAll(): Book[] {
    return this.dbHelper.book.getBooks();
  }

  getById(id: string): Book | undefined {
    return this.dbHelper.book.getBookById(id);
  }

  create(book: Book): Book {
    return this.dbHelper.book.addBook(book);
  }

  update(id: string, updates: Partial<Book>): Book | null {
    return this.dbHelper.book.updateBook(id, updates);
  }

  delete(id: string): boolean {
    return this.dbHelper.book.deleteBook(id);
  }
}