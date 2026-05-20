import type { Request, Response } from 'express';
import { MemoryService } from '../services/memory.service';
import type { Memory } from '../../../types';

export class MemoryController {
  private memoryService: MemoryService;

  constructor() {
    this.memoryService = new MemoryService();
  }

  getAll(_req: Request, res: Response): void {
    try {
      const memorys = this.memoryService.getAll();
      res.json({ code: 200, data: memorys, message: 'success' });
    } catch (error) {
      console.error('获取记忆列表失败:', error);
      res.status(500).json({ code: 500, error: '获取记忆列表失败' });
    }
  }

  getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const memory = this.memoryService.getById(id);

      if (!memory) {
        res.status(404).json({ code: 404, error: '未找到指定的记忆' });
        return;
      }

      res.json({ code: 200, data: memory, message: 'success' });
    } catch (error) {
      console.error('获取记忆失败:', error);
      res.status(500).json({ code: 500, error: '获取记忆失败' });
    }
  }

  getChildren(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const children = this.memoryService.getChildren(id);
      res.json({ code: 200, data: children, message: 'success' });
    } catch (error) {
      console.error('获取记忆子项失败:', error);
      res.status(500).json({ code: 500, error: '获取记忆子项失败' });
    }
  }

  getRecent(_req: Request, res: Response): void {
    try {
      const memorys = this.memoryService.getRecent(5);
      res.json({ code: 200, data: memorys, message: 'success' });
    } catch (error) {
      console.error('获取最近记忆失败:', error);
      res.status(500).json({ code: 500, error: '获取最近记忆失败' });
    }
  }

  getStarred(_req: Request, res: Response): void {
    try {
      const memorys = this.memoryService.getStarred();
      res.json({ code: 200, data: memorys, message: 'success' });
    } catch (error) {
      console.error('获取收藏记忆失败:', error);
      res.status(500).json({ code: 500, error: '获取收藏记忆失败' });
    }
  }

  create(req: Request, res: Response): void {
    try {
      const memoryData: Memory = req.body;
      const newMemory = this.memoryService.create(memoryData);
      res.status(201).json({ code: 201, data: newMemory, message: '记忆创建成功' });
    } catch (error) {
      console.error('创建记忆失败:', error);
      res.status(500).json({ code: 500, error: '创建记忆失败' });
    }
  }

  update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const updateData: Partial<Memory> = req.body;
      const updatedMemory = this.memoryService.update(id, updateData);

      if (!updatedMemory) {
        res.status(404).json({ code: 404, error: '未找到指定的记忆' });
        return;
      }

      res.json({ code: 200, data: updatedMemory, message: '记忆更新成功' });
    } catch (error) {
      console.error('更新记忆失败:', error);
      res.status(500).json({ code: 500, error: '更新记忆失败' });
    }
  }

  delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const result = this.memoryService.delete(id);

      if (!result) {
        res.status(404).json({ code: 404, error: '未找到指定的记忆' });
        return;
      }

      res.json({ code: 200, message: '记忆删除成功' });
    } catch (error) {
      console.error('删除记忆失败:', error);
      res.status(500).json({ code: 500, error: '删除记忆失败' });
    }
  }

  toggleStar(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { memory, wasStarred } = this.memoryService.toggleStar(id);
      console.info(memory)
      if (!memory) {
        res.status(404).json({ code: 404, error: '未找到指定的记忆' });
        return;
      }

      res.json({
        code: 200,
        data: memory,
        message: wasStarred ? '记忆取消收藏成功' : '记忆收藏成功',
      });
    } catch (error) {
      console.error('收藏记忆失败:', error);
      res.status(500).json({ code: 500, error: '收藏记忆失败' });
    }
  }
}
