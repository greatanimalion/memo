import type { Request, Response, NextFunction } from "express";
import { LangGraphService } from "../services/ai/langgraph.service";
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
        url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      };
  }
}

const abortControllerMap = new Map<string, AbortController>();

// 简单聊天的 system prompt（无工具）
const CHAT_SYSTEM_PROMPT = `你是一个中文 AI 助手。请简洁、准确地回答用户的问题。`;

export class AIController {
  private langGraphService: LangGraphService;

  constructor() {
    this.langGraphService = new LangGraphService();
  }

  /**
   * POST /api/chat-stream
   * 简单流式聊天（不带工具，但使用 LangGraph 统一架构）
   */
  async chatStream(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> {
    try {
      res = switchStreamRes(res);
      const {
        prompt,
        history = [],
        model,
        apiKey,
        requestId,
        systemPrompt,
      } = req.body;
      if (!prompt || !model || !apiKey || !requestId) {
        return res
          .status(400)
          .json({ error: "Missing prompt, model, apiKey, or requestId" });
      }

      const abortController = new AbortController();
      abortControllerMap.set(requestId, abortController);

      const config = getModels(model as any);
      await this.langGraphService.runAgent({
        userMessage: prompt,
        conversationHistory: history,
        model: config.model,
        apiKey,
        url: config.url,
        res,
        abortController,
        systemPrompt: systemPrompt || CHAT_SYSTEM_PROMPT,
        maxRounds: 1,
      });

      abortControllerMap.delete(requestId);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/chat-agent
   * Agent 模式聊天（LangGraph + 工具调用 + 流式输出）
   */
  async chatAgent(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> {
    try {
      res = switchStreamRes(res);
      const {
        prompt,
        history = [],
        model,
        apiKey,
        systemPrompt,
      } = req.body;
      if (!prompt || !model || !apiKey) {
        return res
          .status(400)
          .json({ error: "Missing prompt, model, or apiKey" });
      }

      const abortController = new AbortController();
      const config = getModels(model as any);

      await this.langGraphService.runAgent({
        userMessage: prompt,
        conversationHistory: history,
        model: config.model,
        apiKey,
        url: config.url,
        res,
        abortController,
        systemPrompt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/chat-cancel?requestId=
   * 取消正在进行的 AI 请求
   */
  cancelChat(req: Request, res: Response): Response | void {
    const { requestId } = req.query;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId" });
    }
    const controller = abortControllerMap.get(requestId as string);
    if (controller) {
      controller.abort();
      abortControllerMap.delete(requestId as string);
      logger.info("请求已取消:", requestId);
      return res.json({ success: true, message: "请求已取消" });
    }
    return res.status(404).json({ error: "未找到对应的请求" });
  }
}
