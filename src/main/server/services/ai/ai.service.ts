import type { Response } from "express";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";

export interface AIModelConfig {
  model: string;
  url: string;
}

const MAX_HISTORY_LENGTH = 10;

export interface AIRequestError {
  error: string;
  solution?: string;
}

const regularHistoryMessage = (history: any[], prompt: string): BaseMessage[] => {
  const recentHistory = history.slice(-MAX_HISTORY_LENGTH);
  const hasSystemMessage = recentHistory.some(
    (msg: any) => msg.role === "system",
  );
  const messages: BaseMessage[] = hasSystemMessage
    ? recentHistory.map((m: any) =>
        m.role === "system"
          ? new SystemMessage(m.content)
          : new HumanMessage(m.content),
      )
    : [
        new SystemMessage("你是一个中文 AI 助手。"),
        ...recentHistory.map((m: any) =>
          m.role === "user"
            ? new HumanMessage(m.content)
            : new HumanMessage(m.content),
        ),
      ];
  const lastMessage = recentHistory[recentHistory.length - 1];
  if (
    !lastMessage ||
    lastMessage.role !== "user" ||
    lastMessage.content !== prompt
  ) {
    messages.push(new HumanMessage(prompt));
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
      const llm = new ChatOpenAI({
        modelName: model,
        apiKey,
        configuration: { baseURL: url },
        streaming: true,
      });

      const stream = await llm.stream(messages, {
        signal: abortController.signal,
      });

      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === "string") {
          res.write(content);
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === "text") {
              res.write(part.text);
            }
          }
        }
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
