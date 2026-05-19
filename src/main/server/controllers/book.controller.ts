import type { Request, Response } from 'express';
import { BookService } from '../services/book.service';
import type { Book } from '../../../types/book';

export class BookController {
  private BookService: BookService;

  constructor() {
    this.BookService = new BookService();
  }

  getAll(_req: Request, res: Response): void {
    try {
      const books = this.BookService.getAll();
      res.json({ code: 200, data: books, message: 'success' });
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      res.status(500).json({ code: 500, error: '获取书籍列表失败' });
    }
  }

  getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const book = this.BookService.getById(id);
      if (!book) {
        res.status(404).json({ code: 404, error: '未找到指定的书籍' });
        return;
      }
      res.json({ code: 200, data: book, message: 'success' });
    } catch (error) {
      console.error('获取书籍失败:', error);
      res.status(500).json({ code: 500, error: '获取书籍失败' });
    }
  }

  create(req: Request, res: Response): void {
    try {
      const bookData: Book = req.body;
      const newBook = this.BookService.create(bookData);
      res.status(201).json({ code: 201, data: newBook, message: '书籍创建成功' });
    } catch (error) {
      console.error('创建书籍失败:', error);
      res.status(500).json({ code: 500, error: '创建书籍失败' });
    }
  }

  update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const updateData: Partial<Book> = req.body;
      const updatedBook = this.BookService.update(id, updateData);
      if (!updatedBook) {
        const newBook = this.BookService.create(req.body);
        res.status(200).json({ code: 200, data: newBook, message: '书籍创建成功' });
        return;
      }

      res.json({ code: 200, data: updatedBook, message: '书籍更新成功' });
    } catch (error) {
      console.error('更新书籍失败:', error);
      res.status(500).json({ code: 500, error: '更新书籍失败' });
    }
  }

  delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const result = this.BookService.delete(id);

      if (!result) {
        res.status(404).json({ code: 404, error: '未找到指定的书籍' });
        return;
      }

      res.json({ code: 200, message: '书籍删除成功' });
    } catch (error) {
      console.error('删除书籍失败:', error);
      res.status(500).json({ code: 500, error: '删除书籍失败' });
    }
  }
}