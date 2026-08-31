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

// ──────────────────── Default system prompt ────────────────────

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
   * 流式 Agent 执行（LangGraph + 工具调用 + 逐 token 流式输出）
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
          res.write("\n\n[请求已取消]");
          res.end();
          return false;
        }

        for (const [node, output] of Object.entries(event)) {
          // 工具执行结果
          if (node === "tools") {
            const toolMsgs = (output as { messages: BaseMessage[] })
              .messages;
            for (const msg of toolMsgs) {
              res.write(`\n[tool:${msg.name}] ${msg.content}\n`);
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
                    res.write(`\n[call:${tc.name}]\n`);
                  }
                } else if (msg.content) {
                  // 流式输出最终回复 — 如果 LLM 已经 stream 完整回复
                  // 对于 streaming: true 的情况，token 已通过 LLM stream 写入
                  // 这里处理非 stream 的兜底
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
                    res.write(content);
                  }
                }
              }
            }
          }
        }
      }

      res.end();
      return true;
    } catch (error: any) {
      if (
        abortController.signal.aborted ||
        error.name === "AbortError"
      ) {
        res.write("\n\n[请求已取消]");
      } else {
        logger.error("Agent 执行错误:", error);
        res.write(`\n\n[错误] ${error.message}`);
      }
      res.end();
      return false;
    }
  }
}
