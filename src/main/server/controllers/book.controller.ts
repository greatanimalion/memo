import type { Request, Response } from 'express';
import { BookService } from '../services/book.service';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import type { Book } from '../../../types/book';

export class BookController {
  private BookService: BookService;

  constructor() {
    this.BookService = new BookService();
  }

  getAll(_req: Request, res: Response): void {
    const books = this.BookService.getAll();
    successResponse(res, books);
  }

  getById(req: Request, res: Response): void {
    const { id } = req.params;
    const book = this.BookService.getById(id);
    if (!book) {
      errorResponse(res, 404, '未找到指定的书籍');
      return;
    }
    successResponse(res, book);
  }

  create(req: Request, res: Response): void {
    const bookData: Book = req.body;
    const newBook = this.BookService.create(bookData);
    createdResponse(res, newBook, '书籍创建成功');
  }

  update(req: Request, res: Response): void {
    const { id } = req.params;
    const updateData: Partial<Book> = req.body;
    const updatedBook = this.BookService.update(id, updateData);
    if (!updatedBook) {
      const newBook = this.BookService.create(req.body);
      successResponse(res, newBook, '书籍创建成功');
      return;
    }
    successResponse(res, updatedBook, '书籍更新成功');
  }

  delete(req: Request, res: Response): void {
    const { id } = req.params;
    const result = this.BookService.delete(id);
    if (!result) {
      errorResponse(res, 404, '未找到指定的书籍');
      return;
    }
    successResponse(res, null, '书籍删除成功');
  }
}
