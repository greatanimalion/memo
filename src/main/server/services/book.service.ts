import { DatabaseHelper } from "@main/server/db";
import type { Book, Chapter, Volume, BookDetail } from "@type/book";
import crypto from "crypto";

function generateUUID(): string {
  return crypto.randomUUID();
}

export class BookService {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  // ========== Book ==========

  getAllBooks(): Book[] {
    return this.dbHelper.book.getBooks();
  }

  getBookById(id: string): Book | null {
    return this.dbHelper.book.getBookById(id) || null;
  }

  getBookDetail(id: string): BookDetail | null {
    const book = this.dbHelper.book.getBookById(id);
    if (!book) return null;
    return {
      ...book,
      chapters: this.dbHelper.chapter.getByBookId(id),
      volumes: this.dbHelper.volume.getByBookId(id),
    };
  }

  createBook(data: Book): BookDetail {
    const book = this.dbHelper.book.addBook(data);
    // 创建时自动添加默认章节
    if (!data.chapters || data.chapters.length === 0) {
      this.dbHelper.chapter.addChapter({
        id: data.chapters?.[0]?.id || generateUUID(),
        bookId: book.id,
        title: "第1章",
        content: "",
        order: 1,
      });
    } else {
      for (const ch of data.chapters) {
        this.dbHelper.chapter.addChapter({ ...ch, bookId: book.id });
      }
    }
    return this.getBookDetail(book.id)!;
  }

  updateBook(id: string, data: Partial<Book>): Book | null {
    return this.dbHelper.book.updateBook(id, data);
  }

  deleteBook(id: string): boolean {
    // 级联删除 chapters 和 volumes
    this.dbHelper.chapter.deleteByBookId(id);
    this.dbHelper.volume.deleteByBookId(id);
    return this.dbHelper.book.deleteBook(id);
  }

  // ========== Chapter ==========

  getChaptersByBookId(bookId: string): Chapter[] {
    return this.dbHelper.chapter.getByBookId(bookId);
  }

  getChapterById(id: string): Chapter | null {
    return this.dbHelper.chapter.getById(id) || null;
  }

  createChapter(data: Chapter): Chapter {
    const maxOrder = this.dbHelper.chapter.getMaxOrder(data.bookId);
    return this.dbHelper.chapter.addChapter({ ...data, order: data.order || maxOrder + 1 });
  }

  updateChapter(id: string, data: Partial<Chapter>): Chapter | null {
    return this.dbHelper.chapter.updateChapter(id, data);
  }

  deleteChapter(id: string): boolean {
    return this.dbHelper.chapter.deleteChapter(id);
  }

  // ========== Volume ==========

  getVolumesByBookId(bookId: string): Volume[] {
    return this.dbHelper.volume.getByBookId(bookId);
  }

  getVolumeById(id: string): Volume | null {
    return this.dbHelper.volume.getById(id) || null;
  }

  createVolume(data: Volume): Volume {
    const maxOrder = this.dbHelper.volume.getMaxOrder(data.bookId);
    return this.dbHelper.volume.addVolume({ ...data, order: data.order || maxOrder + 1 });
  }

  updateVolume(id: string, data: Partial<Volume>): Volume | null {
    return this.dbHelper.volume.updateVolume(id, data);
  }

  deleteVolume(id: string): boolean {
    return this.dbHelper.volume.deleteVolume(id);
  }
}
