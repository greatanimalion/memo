import type { Request, Response } from "express";
import { BookAgentService } from "@main/server/services/bookAgent.service";
import {
  successResponse,
  createdResponse,
  errorResponse,
} from "@main/server/utils/response";
import type { BookAgent } from "@type/book";


export class BookAgentController {
  private bookAgentService: BookAgentService;

  constructor() {
    this.bookAgentService = new BookAgentService();
  }

  getByBookId(req: Request, res: Response): void {
    const { bookId } = req.params;
    if (!bookId) {
      errorResponse(res, 400, "缺少 bookId 参数");
      return;
    }
    const records = this.bookAgentService.getByBookId(bookId  as string);
    successResponse(res, records);
  }

  getById(req: Request, res: Response): void {
    const { id } = req.params;
    const record = this.bookAgentService.getById(id);
    if (!record) {
      errorResponse(res, 404, "未找到指定的对话记录");
      return;
    }
    successResponse(res, record);
  }

  create(req: Request, res: Response): void {
    const data: BookAgent = req.body;
    if (!data.bookId) {
      errorResponse(res, 400, "缺少 bookId");
      return;
    }
    const record = this.bookAgentService.create(data);
    createdResponse(res, record, "对话记录创建成功");
  }

  update(req: Request, res: Response): void {
    const { id } = req.params;
    const updateData: Partial<BookAgent> = req.body;
    const record = this.bookAgentService.update(id, updateData);
    if (!record) {
      errorResponse(res, 404, "未找到指定的对话记录");
      return;
    }
    successResponse(res, record, "对话记录更新成功");
  }

  delete(req: Request, res: Response): void {
    const { id } = req.params;
    const result = this.bookAgentService.delete(id as string);
    if (!result) {
      errorResponse(res, 404, "未找到指定的对话记录");
      return;
    }
    successResponse(res, null, "对话记录删除成功");
  }

  deleteByBookId(req: Request, res: Response): void {
    const { bookId } = req.params;
    if (!bookId) { 
      errorResponse(res, 400, "缺少 bookId 参数");
      return;
    }
    this.bookAgentService.deleteByBookId(bookId as string);
    successResponse(res, null, "已删除该书籍的所有对话记录");
  }
}
