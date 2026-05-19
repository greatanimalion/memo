import type { Request, Response } from 'express';
import { AgentService } from '../services/agent.service';
import type { MyAgent } from '../../../types';

export class AgentController {
  private agentService: AgentService;
  constructor() {
    this.agentService = new AgentService();
  }
  getAll(_req: Request, res: Response): void {
    try {
      const agents = this.agentService.getAll();
      res.json({ code: 200, data: agents, message: 'success' });
    } catch (error) {
      console.error('获取agent列表失败:', error);
      res.status(500).json({ code: 500, error: '获取agent列表失败' });
    }
  }
  create(req: Request, res: Response): void {
    try {
      const agentData: MyAgent = req.body;
      const newAgent = this.agentService.create(agentData);
      res.status(201).json({ code: 201, data: newAgent, message: 'agent创建成功' });
    } catch (error) {
      console.error('创建agent失败:', error);
      res.status(500).json({ code: 500, error: '创建agent失败' });
    }
  }
  update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const updateData: Partial<MyAgent> = req.body;
      const updatedAgent = this.agentService.update(id, updateData);
      if (!updatedAgent) {
        const newAgent = this.agentService.create(updateData as MyAgent);
        res.status(201).json({ code: 201, data: newAgent, message: 'agent创建成功' });
        return;
      }
      res.json({ code: 200, data: updatedAgent, message: 'agent更新成功' });
    } catch (error) {
      console.error('更新agent失败:', error);
      res.status(500).json({ code: 500, error: '更新agent失败' });
    }
  }
  delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const result = this.agentService.delete(id);
      if (!result) {
        res.status(404).json({ code: 404, error: '未找到指定的agent' });
        return;
      }
      res.json({ code: 200, message: 'agent删除成功' });
    } catch (error) {
      console.error('删除agent失败:', error);
      res.status(500).json({ code: 500, error: '删除agent失败' });
    }
  }
}
