import type { Request, Response } from 'express';
import { AgentService } from '../services/agent.service';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import type { MyAgent } from '../../../types';

export class AgentController {
  private agentService: AgentService;
  constructor() {
    this.agentService = new AgentService();
  }
  getAll(_req: Request, res: Response): void {
    const agents = this.agentService.getAll();
    successResponse(res, agents);
  }
  create(req: Request, res: Response): void {
    const agentData: MyAgent = req.body;
    const newAgent = this.agentService.create(agentData);
    createdResponse(res, newAgent, 'agent创建成功');
  }
  update(req: Request, res: Response): void {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updateData: Partial<MyAgent> = req.body;
    const updatedAgent = this.agentService.update(id, updateData);
    if (!updatedAgent) {
      const newAgent = this.agentService.create(updateData as MyAgent);
      createdResponse(res, newAgent, 'agent创建成功');
      return;
    }
    successResponse(res, updatedAgent, 'agent更新成功');
  }
  delete(req: Request, res: Response): void {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = this.agentService.delete(id);
    if (!result) {
      errorResponse(res, 404, '未找到指定的agent');
      return;
    }
    successResponse(res, null, 'agent删除成功');
  }
}
