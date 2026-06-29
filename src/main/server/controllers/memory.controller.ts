import type { Request, Response } from 'express';
import { MemoryService } from '../services/memory.service';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import type { Memory } from '../../../types';

export class MemoryController {
  private memoryService: MemoryService;

  constructor() {
    this.memoryService = new MemoryService();
  }

  getAll(_req: Request, res: Response): void {
    const memorys = this.memoryService.getAll();
    successResponse(res, memorys);
  }

  getById(req: Request, res: Response): void {
    const { id } = req.params;
    const memory = this.memoryService.getById(id);
    if (!memory) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, memory);
  }

  getChildren(req: Request, res: Response): void {
    const { id } = req.params;
    const children = this.memoryService.getChildren(id);
    successResponse(res, children);
  }

  getRecent(_req: Request, res: Response): void {
    const memorys = this.memoryService.getRecent(5);
    successResponse(res, memorys);
  }

  getStarred(_req: Request, res: Response): void {
    const memorys = this.memoryService.getStarred();
    successResponse(res, memorys);
  }

  create(req: Request, res: Response): void {
    const memoryData: Memory = req.body;
    const newMemory = this.memoryService.create(memoryData);
    createdResponse(res, newMemory, '记忆创建成功');
  }

  update(req: Request, res: Response): void {
    const { id } = req.params;
    const updateData: Partial<Memory> = req.body;
    const updatedMemory = this.memoryService.update(id, updateData);
    if (!updatedMemory) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, updatedMemory, '记忆更新成功');
  }

  delete(req: Request, res: Response): void {
    const { id } = req.params;
    const result = this.memoryService.delete(id);
    if (!result) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, null, '记忆删除成功');
  }

  toggleStar(req: Request, res: Response): void {
    const { id } = req.params;
    const { memory, wasStarred } = this.memoryService.toggleStar(id);
    if (!memory) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, memory, wasStarred ? '记忆取消收藏成功' : '记忆收藏成功');
  }
}
