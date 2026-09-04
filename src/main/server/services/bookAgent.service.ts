import { DatabaseHelper } from "@main/server/db";
import type { BookAgent } from "@type/book";

export class BookAgentService {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getByBookId(bookId: string): BookAgent[] {
    return this.dbHelper.bookAgent.getByBookId(bookId);
  }

  getById(id: string): BookAgent | null {
    return this.dbHelper.bookAgent.getById(id) || null;
  }

  create(data: BookAgent): BookAgent {
    return this.dbHelper.bookAgent.add(data);
  }

  update(id: string, data: Partial<BookAgent>): BookAgent | null {
    return this.dbHelper.bookAgent.update(id, data);
  }

  delete(id: string): boolean {
    return this.dbHelper.bookAgent.delete(id);
  }

  deleteByBookId(bookId: string): boolean {
    return this.dbHelper.bookAgent.deleteByBookId(bookId);
  }
}
