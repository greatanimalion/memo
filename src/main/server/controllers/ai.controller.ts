import type { Request, Response, NextFunction } from "express";
import { AIService } from "../services/ai/ai.service";
import { AgentToolService } from "../services/ai/agent.service";
import { logger } from "../utils/logger";

const switchStreamRes = (res: Response) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  return res;
};
function getModels(type: "qwen-plus" | "glm-5.1" | "deepseek" | "openRouter") {
  switch (type) {
    case "qwen-plus":
      return {
        model: "qwen-plus",
        url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      };
    case "glm-5.1":
      return {
        model: "glm-5.1",
        url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      };
    case "deepseek":
      return {
        model: "deepseek-chat",
        url: "https://api.deepseek.com/v1",
      };
    case "openRouter":
      return {
        model: "openai/gpt-5.2",
        url: "https://openrouter.ai/api/v1/chat/completions",
      };
    default:
      return {
        model: "qwen-plus",
        url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models/qwen-plus/download",
      };
  }
}
const abortControllerMap = new Map<string, AbortController>();
export class AIController {
  private aiService: AIService;
  private agentToolService: AgentToolService;
  constructor() {
    this.aiService = new AIService();
    this.agentToolService = new AgentToolService();
  }
  chatStream(req: Request, res: Response) {
    res = switchStreamRes(res);
    const { prompt, history = [], model, apiKey, requestId } = req.body;
    if (!prompt || !model || !apiKey || !requestId) {
      return res
        .status(400)
        .json({ error: "Missing prompt, model, or apiKey or requestId" });
    }
    const abortController = new AbortController();
    abortControllerMap.set(requestId, abortController);
    const config = getModels(model as any);
    this.aiService.chatStream(
      prompt,
      history,
      config.model,
      config.url,
      apiKey,
      res,
      abortController,
    );
  }
  async chatAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res = switchStreamRes(res);
      const { prompt, history = [], model, apiKey } = req.body;
      if (!prompt || !model || !apiKey) {
        return res
          .status(400)
          .json({ error: "Missing prompt, model, or apiKey" });
      }
      const abortController = new AbortController();
      const config = getModels(model as any);
      await this.agentToolService.runAgent(
        prompt,
        history,
        config.model,
        apiKey,
        config.url,
        res,
        abortController,
      );
    } catch (error) {
      next(error);
    }
  }
  cancelChat(req: Request, res: Response) {
    const { requestId } = req.query;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId" });
    }
    const result = this.abort(requestId as string);
    if (result) {
      res.json({ success: true, message: "请求已取消" });
    } else {
      res.status(404).json({ error: "未找到对应的请求" });
    }
  }
  abort(requestId: string): boolean {
    logger.info("取消请求", requestId, abortControllerMap.get(requestId));
    const controller = abortControllerMap.get(requestId);
    if (controller) {
      controller.abort();
      abortControllerMap.delete(requestId);
      return true;
    }
    return false;
  }
}