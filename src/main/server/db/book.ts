import { BaseDatabase } from './base';

export class BookDatabase extends BaseDatabase {
  public getBooks(): any[] {
    const stmt = this.db.prepare('SELECT * FROM books');
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      ...row,
      chapters: JSON.parse(row.chapters || '[]')
    }));
  }

  public getBookById(id: string): any | undefined {
    const stmt = this.db.prepare('SELECT * FROM books WHERE id = ?');
    const row = stmt.get(id) as any;
    if (row) {
      return {
        ...row,
        chapters: JSON.parse(row.chapters || '[]')
      };
    }
    return undefined;
  }

  public addBook(book: any): any {
    const stmt = this.db.prepare(`
      INSERT INTO books (id, title, author, cover, chapters) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      book.id,
      book.title,
      book.author || '',
      book.cover || '',
      JSON.stringify(book.chapters || [])
    );
    return {
      ...book,
      chapters: book.chapters || []
    };
  }

  public updateBook(id: string, updates: any): any | null {
    const fields = Object.keys(updates)
      .filter((key) => key !== 'id')
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([key, value]) => {
        if (key === 'chapters') {
          return JSON.stringify(value);
        }
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE books SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values, id);

    const selectStmt = this.db.prepare('SELECT * FROM books WHERE id = ?');
    const row = selectStmt.get(id) as any;
    if (row) {
      return {
        ...row,
        chapters: JSON.parse(row.chapters || '[]')
      };
    }
    return null;
  }

  public deleteBook(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM books WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public getBookUtils(): any[] {
    const stmt = this.db.prepare('SELECT * FROM bookUtils');
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      ...row,
      image: JSON.parse(row.image || '[]'),
      list: JSON.parse(row.list || '[]')
    }));
  }

  public getBookUtilsById(id: string): any | undefined {
    const stmt = this.db.prepare('SELECT * FROM bookUtils WHERE id = ?');
    const row = stmt.get(id) as any;
    if (row) {
      return {
        ...row,
        image: JSON.parse(row.image || '[]'),
        list: JSON.parse(row.list || '[]')
      };
    }
    return undefined;
  }

  public getBookUtilsByBookId(bookId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM bookUtils WHERE BookID = ?');
    const rows = stmt.all(bookId) as any[];
    return rows.map((row) => ({
      ...row,
      image: JSON.parse(row.image || '[]'),
      list: JSON.parse(row.list || '[]')
    }));
  }

  public addBookUtils(bookUtils: any): any {
    const stmt = this.db.prepare(`
      INSERT INTO bookUtils (id, BookID, image, type, description, list, createTime) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      bookUtils.id,
      bookUtils.BookID,
      JSON.stringify(bookUtils.image || []),
      bookUtils.type || '',
      bookUtils.description || '',
      JSON.stringify(bookUtils.list || []),
      bookUtils.createTime || Date.now()
    );
    return {
      ...bookUtils,
      image: bookUtils.image || [],
      list: bookUtils.list || []
    };
  }

  public updateBookUtils(id: string, updates: any): any | null {
    const fields = Object.keys(updates)
      .filter((key) => key !== 'id')
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([key, value]) => {
        if (key === 'image' || key === 'list') {
          return JSON.stringify(value);
        }
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE bookUtils SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values, id);

    const selectStmt = this.db.prepare('SELECT * FROM bookUtils WHERE id = ?');
    const row = selectStmt.get(id) as any;
    if (row) {
      return {
        ...row,
        image: JSON.parse(row.image || '[]'),
        list: JSON.parse(row.list || '[]')
      };
    }
    return null;
  }

  public deleteBookUtils(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM bookUtils WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}