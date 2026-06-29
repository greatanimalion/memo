import type { Request, Response } from 'express';
import { SessionService } from '../services/session.service';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import type { Session } from '../../../types';

export class SessionController {
  private sessionService: SessionService;

  constructor() {
    this.sessionService = new SessionService();
  }

  getAll(_req: Request, res: Response): void {
    const sessions = this.sessionService.getAll();
    successResponse(res, sessions);
  }

  getById(req: Request, res: Response): void {
    const { id } = req.params;
    const session = this.sessionService.getById(id);
    if (!session) {
      errorResponse(res, 404, '未找到指定的会话');
      return;
    }
    successResponse(res, session);
  }

  create(req: Request, res: Response): void {
    const sessionData: Session = req.body;
    const newSession = this.sessionService.create(sessionData);
    createdResponse(res, newSession, '会话创建成功');
  }

  update(req: Request, res: Response): void {
    const { id } = req.params;
    const updateData: Partial<Session> = req.body;
    const updatedSession = this.sessionService.update(id, updateData);
    if (!updatedSession) {
      errorResponse(res, 404, '未找到指定的会话');
      return;
    }
    successResponse(res, updatedSession, '会话更新成功');
  }

  delete(req: Request, res: Response): void {
    const { id } = req.params;
    const result = this.sessionService.delete(id);
    if (!result) {
      errorResponse(res, 404, '未找到指定的会话');
      return;
    }
    successResponse(res, null, '会话删除成功');
  }
}
