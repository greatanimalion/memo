import type { Response as ExpressResponse } from "express";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { DiaryService } from "@main/server/services/diary.service";
import { MemoryService } from "@main/server/services/memory.service";
import { logger } from "@main/server/utils/logger";
import { sseWrite } from "@main/server/utils/response";
import type { Diary } from "@type";

const diaryService = new DiaryService();
const memoryService = new MemoryService();

// ──────────────────── Tools ────────────────────

const getTimeTool = tool(
  async () =>
    new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
  {
    name: "get_time",
    description: "获取当前日期和时间",
    schema: z.object({}),
  },
);

const writeDiaryTool = tool(
  async ({ date, todos, note }) => {
    const todoItems = todos.map((t) => ({
      id: Date.now() + Math.random(),
      text: t.text,
      completed: false,
    }));
    const diaryData: Partial<Diary> = {
      id: date,
      monthDiarys: {
        [date]: { todos: todoItems, note: note || "" },
      },
    };
    diaryService.update(date, diaryData);
    return `日记记录成功，日期：${date}`;
  },
  {
    name: "write_diary",
    description: "记录日记，传入日期、待办事项列表和备注",
    schema: z.object({
      date: z.string().describe("日记日期，格式：YYYY-MM-DD"),
      todos: z
        .array(
          z.object({
            text: z.string().describe("待办事项内容"),
          }),
        )
        .describe("待办事项列表"),
      note: z.string().optional().describe("日记备注或总结"),
    }),
  },
);

const getMemoryTool = tool(
  async ({ keyword }) => {
    const all = memoryService.getAll();
    if (keyword) {
      const filtered = all.filter(
        (m) =>
          !m.isFolder &&
          m.title.toLowerCase().includes(keyword.toLowerCase()),
      );
      if (filtered.length === 0) return "未找到匹配的记忆";
      return filtered
        .slice(0, 10)
        .map((m) => `[${m.title}] (id: ${m.id})`)
        .join("\n");
    }
    const recent = all
      .filter((m) => !m.isFolder)
      .sort((a, b) => (b.visitedTime || 0) - (a.visitedTime || 0))
      .slice(0, 10);
    if (recent.length === 0) return "暂无记忆";
    return recent
      .map((m) => `[${m.title}] (id: ${m.id})`)
      .join("\n");
  },
  {
    name: "get_memory",
    description: "搜索或列出用户的记忆/笔记，可按关键词搜索",
    schema: z.object({
      keyword: z.string().optional().describe("搜索关键词，为空则列出最近的记忆"),
    }),
  },
);

const allTools = [getTimeTool, writeDiaryTool, getMemoryTool];

// ──────────────────── Graph ────────────────────

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
});

function createAgentGraph(llm: ChatOpenAI) {
  const llmWithTools = llm.bindTools(allTools);

  const agentNode = async (state: typeof GraphState.State) => {
    const response = await llmWithTools.invoke(state.messages);
    return { messages: [response] };
  };

  const shouldContinue = (state: typeof GraphState.State) => {
    const lastMessage = state.messages[
      state.messages.length - 1
    ] as AIMessage;
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    return END;
  };

  const toolNode = new ToolNode(allTools);

  const workflow = new StateGraph(GraphState)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      [END]: END,
    })
    .addEdge("tools", "agent");

  return workflow.compile();
}

// ──────────────────── Default system prompts ────────────────────

const CHAT_SYSTEM_PROMPT = `你是一个中文 AI 助手。请简洁、准确地回答用户的问题。`;

const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，可以调用工具来帮助用户。
可用工具：
- get_time: 查询当前时间
- write_diary: 记录日记（日期、待办事项、备注）
- get_memory: 搜索或列出用户的记忆/笔记
当用户请求相关操作时，请调用合适的工具。请用中文回复。`;

// ──────────────────── Public API ────────────────────

export interface AgentRunRequest {
  userMessage: string;
  conversationHistory: { role: string; content: string }[];
  model: string;
  apiKey: string;
  url: string;
  res: ExpressResponse;
  abortController: AbortController;
  systemPrompt?: string;
  temperature?: number;
  maxRounds?: number;
}

export class LangGraphService {
  /**
   * 简单流式聊天（不走 LangGraph，直接调用 LLM）
   */
  async chatStream({
    userMessage,
    conversationHistory,
    model,
    apiKey,
    url,
    res,
    abortController,
    systemPrompt,
    temperature = 0.7,
  }: Omit<AgentRunRequest, "maxRounds">): Promise<boolean> {
    const llm = new ChatOpenAI({
      modelName: model,
      apiKey,
      configuration: { baseURL: url },
      temperature,
      streaming: true,
    });

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt || CHAT_SYSTEM_PROMPT),
      ...conversationHistory.map((m) =>
        m.role === "user"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
      new HumanMessage(userMessage),
    ];

    try {
      const stream = await llm.stream(messages, {
        signal: abortController.signal,
      });

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          sseWrite(res, "cancel", "请求已取消");
          sseWrite(res, "done", "[DONE]");
          res.end();
          return false;
        }
        const text =
          typeof chunk.content === "string"
            ? chunk.content
            : Array.isArray(chunk.content)
              ? chunk.content
                  .filter((p: any) => p.type === "text")
                  .map((p: any) => p.text)
                  .join("")
              : "";
        if (text) {
          sseWrite(res, "message", text);
        }
      }

      sseWrite(res, "done", "[DONE]");
      res.end();
      return true;
    } catch (error: any) {
      if (abortController.signal.aborted || error.name === "AbortError") {
        sseWrite(res, "cancel", "请求已取消");
      } else {
        logger.error("ChatStream 执行错误:", error);
        sseWrite(res, "error", error.message);
      }
      sseWrite(res, "done", "[DONE]");
      res.end();
      return false;
    }
  }

  /**
   * Agent 流式执行（LangGraph + 工具调用）
   */
  async runAgent({
    userMessage,
    conversationHistory,
    model,
    apiKey,
    url,
    res,
    abortController,
    systemPrompt,
    temperature = 0.7,
    maxRounds = 10,
  }: AgentRunRequest): Promise<boolean> {
    const llm = new ChatOpenAI({
      modelName: model,
      apiKey,
      configuration: { baseURL: url },
      temperature,
      streaming: true,
    });

    const graph = createAgentGraph(llm);

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt || DEFAULT_SYSTEM_PROMPT),
      ...conversationHistory.map((m) =>
        m.role === "user"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
      new HumanMessage(userMessage),
    ];

    try {
      const stream = await graph.stream(
        { messages },
        { recursionLimit: maxRounds, signal: abortController.signal },
      );

      for await (const event of stream) {
        if (abortController.signal.aborted) {
          sseWrite(res, "cancel", "请求已取消");
          res.end();
          return false;
        }

        for (const [node, output] of Object.entries(event)) {
          // 工具执行结果
          if (node === "tools") {
            const toolMsgs = (output as { messages: BaseMessage[] })
              .messages;
            for (const msg of toolMsgs) {
              sseWrite(res, "tool", JSON.stringify({ name: msg.name, result: msg.content }));
            }
          }

          // Agent 回复（含 tool_calls 或最终文本）
          if (node === "agent") {
            const agentMsgs = (output as { messages: BaseMessage[] })
              .messages;
            for (const msg of agentMsgs) {
              if (msg instanceof AIMessage) {
                if (
                  msg.tool_calls &&
                  msg.tool_calls.length > 0
                ) {
                  for (const tc of msg.tool_calls) {
                    sseWrite(res, "tool_call", JSON.stringify({ name: tc.name }));
                  }
                } else if (msg.content) {
                  const content =
                    typeof msg.content === "string"
                      ? msg.content
                      : Array.isArray(msg.content)
                        ? msg.content
                            .filter(
                              (p: any) => p.type === "text",
                            )
                            .map((p: any) => p.text)
                            .join("")
                        : "";
                  if (content) {
                    sseWrite(res, "message", content);
                  }
                }
              }
            }
          }
        }
      }

      sseWrite(res, "done", "[DONE]");
      res.end();
      return true;
    } catch (error: any) {
      if (
        abortController.signal.aborted ||
        error.name === "AbortError"
      ) {
        sseWrite(res, "cancel", "请求已取消");
      } else {
        logger.error("Agent 执行错误:", error);
        sseWrite(res, "error", error.message);
      }
      sseWrite(res, "done", "[DONE]");
      res.end();
      return false;
    }
  }
}
