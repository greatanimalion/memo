import type { Request, Response } from "express";
import { BookService } from "@main/server/services/book.service";
import {
  successResponse,
  createdResponse,
  errorResponse,
} from "@main/server/utils/response";

export class BookController {
  private bookService: BookService;

  constructor() {
    this.bookService = new BookService();
  }

  // ========== Book ==========

  getAllBooks(_req: Request, res: Response): void {
    const books = this.bookService.getAllBooks();
    successResponse(res, books);
  }

  getBookById(req: Request, res: Response): void {
    const id = req.params.id as string;
    const book = this.bookService.getBookById(id);
    if (!book) {
      errorResponse(res, 404, "未找到指定的书籍");
      return;
    }
    successResponse(res, book);
  }

  getBookDetail(req: Request, res: Response): void {
    const id = req.params.id as string;
    const detail = this.bookService.getBookDetail(id);
    if (!detail) {
      errorResponse(res, 404, "未找到指定的书籍");
      return;
    }
    successResponse(res, detail);
  }

  createBook(req: Request, res: Response): void {
    const bookData = req.body;
    const newBook = this.bookService.createBook(bookData);
    createdResponse(res, newBook, "书籍创建成功");
  }

  updateBook(req: Request, res: Response): void {
    const id = req.params.id as string;
    const updateData = req.body;
    const updatedBook = this.bookService.updateBook(id, updateData);
    if (!updatedBook) {
      errorResponse(res, 404, "未找到指定的书籍");
      return;
    }
    successResponse(res, updatedBook, "书籍更新成功");
  }

  deleteBook(req: Request, res: Response): void {
    const id = req.params.id as string;
    const result = this.bookService.deleteBook(id);
    if (!result) {
      errorResponse(res, 404, "未找到指定的书籍");
      return;
    }
    successResponse(res, null, "书籍删除成功");
  }

  // ========== Chapter ==========

  getChapters(req: Request, res: Response): void {
    const bookId = req.params.bookId as string;
    const chapters = this.bookService.getChaptersByBookId(bookId);
    successResponse(res, chapters);
  }

  getChapterById(req: Request, res: Response): void {
    const id = req.params.id as string;
    const chapter = this.bookService.getChapterById(id);
    if (!chapter) {
      errorResponse(res, 404, "未找到指定的章节");
      return;
    }
    successResponse(res, chapter);
  }

  createChapter(req: Request, res: Response): void {
    const chapterData = req.body;
    const newChapter = this.bookService.createChapter(chapterData);
    createdResponse(res, newChapter, "章节创建成功");
  }

  updateChapter(req: Request, res: Response): void {
    const id = req.params.id as string;
    const updateData = req.body;
    const updatedChapter = this.bookService.updateChapter(id, updateData);
    if (!updatedChapter) {
      errorResponse(res, 404, "未找到指定的章节");
      return;
    }
    successResponse(res, updatedChapter, "章节更新成功");
  }

  deleteChapter(req: Request, res: Response): void {
    const id = req.params.id as string;
    const result = this.bookService.deleteChapter(id);
    if (!result) {
      errorResponse(res, 404, "未找到指定的章节");
      return;
    }
    successResponse(res, null, "章节删除成功");
  }

  // ========== Volume ==========

  getVolumes(req: Request, res: Response): void {
    const bookId = req.params.bookId as string;
    const volumes = this.bookService.getVolumesByBookId(bookId);
    successResponse(res, volumes);
  }

  getVolumeById(req: Request, res: Response): void {
    const id = req.params.id as string;
    const volume = this.bookService.getVolumeById(id);
    if (!volume) {
      errorResponse(res, 404, "未找到指定的卷");
      return;
    }
    successResponse(res, volume);
  }

  createVolume(req: Request, res: Response): void {
    const volumeData = req.body;
    const newVolume = this.bookService.createVolume(volumeData);
    createdResponse(res, newVolume, "卷创建成功");
  }

  updateVolume(req: Request, res: Response): void {
    const id = req.params.id as string;
    const updateData = req.body;
    const updatedVolume = this.bookService.updateVolume(id, updateData);
    if (!updatedVolume) {
      errorResponse(res, 404, "未找到指定的卷");
      return;
    }
    successResponse(res, updatedVolume, "卷更新成功");
  }

  deleteVolume(req: Request, res: Response): void {
    const id = req.params.id as string;
    const result = this.bookService.deleteVolume(id);
    if (!result) {
      errorResponse(res, 404, "未找到指定的卷");
      return;
    }
    successResponse(res, null, "卷删除成功");
  }
}
