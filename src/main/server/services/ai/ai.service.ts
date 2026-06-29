import type { Response } from "express";
import OpenAI from "openai";
export interface AIModelConfig {
  model: string;
  url: string;
}
const MAX_HISTORY_LENGTH = 10;
export interface AIRequestError {
  error: string;
  solution?: string;
}
const regularHistoryMessage = (history: any[], prompt: string): any[] => {
  const recentHistory = history.slice(-MAX_HISTORY_LENGTH);
  const hasSystemMessage = recentHistory.some(
    (msg: any) => msg.role === "system",
  );
  let messages = hasSystemMessage
    ? [...recentHistory]
    : [{ role: "system", content: "你是一个中文 AI 助手。" }, ...recentHistory];
  const lastMessage = recentHistory[recentHistory.length - 1];
  if (
    !lastMessage ||
    lastMessage.role !== "user" ||
    lastMessage.content !== prompt
  ) {
    messages.push({ role: "user", content: prompt });
  }
  return messages;
};
export class AIService {
  async chatStream(
    prompt: string,
    history: any[],
    model: string,
    url: string,
    apiKey: string,
    res: Response,
    abortController: AbortController,
  ): Promise<void> {
    const messages = regularHistoryMessage(history, prompt);
    try {
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: url,
      });
      const stream = await openai.chat.completions.create(
        {
          model: model,
          messages: messages,
          stream: true,
        },
        { signal: abortController.signal },
      );
      for await (const event of stream) {
        const content = event.choices?.[0]?.delta?.content ?? "";
        if (content) res.write(content);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        res.write("\n\n[请求已取消]");
      } else {
        res.write(`\n\n[错误] ${err.message}`);
      }
    } finally {
      res.end();
    }
  }
}
