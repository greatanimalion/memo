import type { Request, Response } from 'express';
import { AIService } from '../services/ai/ai.service';
import { AgentToolService } from '../services/ai/agent.service';

export class AIController {
  private aiService: AIService;
  private agentToolService: AgentToolService;
  constructor() {
    this.aiService = new AIService();
    this.agentToolService = new AgentToolService();
  }
  async chatStream(req: Request, res: Response): Promise<void> {
    const { prompt, history = [], model, apiKey } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }
    if (!model || !apiKey) {
      res.status(400).json({ error: 'Missing model or apiKey' });
      return;
    }

    await this.aiService.chatStream(prompt, history, model, apiKey, res);
  }
  async chatAgent(req: Request, res: Response): Promise<void> {
    const { prompt, history = [], model, apiKey } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }
    if (!model || !apiKey) {
      res.status(400).json({ error: 'Missing model or apiKey' });
      return;
    }
    const abortController = new AbortController();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    const config = this.aiService.getModels(model as any);
    await this.agentToolService.runAgent(prompt, history, config.model, apiKey, config.url, res, abortController);
  }
}
