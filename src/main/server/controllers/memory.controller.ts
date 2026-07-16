import type { Request, Response } from 'express';
import { MemoryService } from '@main/server/services/memory.service';
import { successResponse, createdResponse, errorResponse } from '@main/server/utils/response';
import type { Memory } from '@type/memory';

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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const memory = this.memoryService.getById(id);
    if (!memory) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, memory);
  }

  getChildren(req: Request, res: Response): void {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {title,fileUrl,parentId,content} = req.body;
    const updateTime=new Date().getTime();
    const updatedMemory = this.memoryService.update(id, {title,fileUrl,parentId,updated: updateTime,visitedTime: updateTime}, content);
    if (!updatedMemory) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, updatedMemory, '记忆更新成功');
  }

  delete(req: Request, res: Response): void {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = this.memoryService.delete(id);
    if (!result) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, null, '记忆删除成功');
  }

  toggleStar(req: Request, res: Response): void {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { memory, wasStarred } = this.memoryService.toggleStar(id);
    if (!memory) {
      errorResponse(res, 404, '未找到指定的记忆');
      return;
    }
    successResponse(res, memory, wasStarred ? '记忆取消收藏成功' : '记忆收藏成功');
  }
}
