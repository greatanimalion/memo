import type { Request, Response } from 'express';
import { SessionService } from '../services/session.service';
import type { Session } from '../../../types';

export class SessionController {
  private sessionService: SessionService;

  constructor() {
    this.sessionService = new SessionService();
  }

  getAll(_req: Request, res: Response): void {
    try {
      const sessions = this.sessionService.getAll();
      res.json({ code: 200, data: sessions, message: 'success' });
    } catch (error) {
      console.error('获取会话列表失败:', error);
      res.status(500).json({ code: 500, error: '获取会话列表失败' });
    }
  }

  getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const session = this.sessionService.getById(id);
      if (!session) {
        res.status(404).json({ code: 404, error: '未找到指定的会话' });
        return;
      }
      res.json({ code: 200, data: session, message: 'success' });
    } catch (error) {
      console.error('获取会话失败:', error);
      res.status(500).json({ code: 500, error: '获取会话失败' });
    }
  }

  create(req: Request, res: Response): void {
    try {
      const sessionData: Session = req.body;
      const newSession = this.sessionService.create(sessionData);
      res.status(201).json({ code: 201, data: newSession, message: '会话创建成功' });
    } catch (error) {
      console.error('创建会话失败:', error);
      res.status(500).json({ code: 500, error: '创建会话失败' });
    }
  }

  update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const updateData: Partial<Session> = req.body;
      const updatedSession = this.sessionService.update(id, updateData);

      if (!updatedSession) {
        res.status(404).json({ code: 404, error: '未找到指定的会话' });
        return;
      }

      res.json({ code: 200, data: updatedSession, message: '会话更新成功' });
    } catch (error) {
      console.error('更新会话失败:', error);
      res.status(500).json({ code: 500, error: '更新会话失败' });
    }
  }

  delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const result = this.sessionService.delete(id);

      if (!result) {
        res.status(404).json({ code: 404, error: '未找到指定的会话' });
        return;
      }

      res.json({ code: 200, message: '会话删除成功' });
    } catch (error) {
      console.error('删除会话失败:', error);
      res.status(500).json({ code: 500, error: '删除会话失败' });
    }
  }
}
