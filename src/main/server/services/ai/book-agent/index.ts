import type { Response as ExpressResponse } from "express";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { MemoryService } from "@main/server/services/memory.service";
import { BookService } from "@main/server/services/book.service";
import { logger } from "@main/server/utils/logger";

import { ORCHESTRATOR_PROMPT } from "./orchestrator";
import { THINKER_PROMPT } from "./thinker";
import { WRITER_PROMPT } from "./writer";
import { EDITOR_PROMPT } from "./editor";
import { CONSISTENCY_PROMPT } from "./consistency";

const memoryService = new MemoryService();
const bookService = new BookService();

// ──────────────────── 工具定义 ────────────────────

const getBookInfoTool = tool(
  async ({ bookId }) => {
    const detail = bookService.getBookDetail(bookId);
    if (!detail) return "未找到指定书籍";
    return JSON.stringify(
      {
        title: detail.title,
        author: detail.author,
        description: detail.description,
        tags: detail.tags,
        chapterCount: detail.chapters?.length || 0,
        volumeCount: detail.volumes?.length || 0,
        chapters:
          detail.chapters?.map((c) => ({
            id: c.id,
            title: c.title,
            wordCount: c.wordCount,
            order: c.order,
          })) || [],
      },
      null,
      2,
    );
  },
  {
    name: "get_book_info",
    description: "获取书籍详细信息（标题、章节目录等）",
    schema: z.object({
      bookId: z.string().describe("书籍 ID"),
    }),
  },
);

const saveChapterTool = tool(
  async ({ bookId, title, content, order }) => {
    const chapter = bookService.createChapter({
      id: crypto.randomUUID(),
      bookId,
      title,
      content,
      wordCount: content.length,
      order: order || 0,
    });
    return `章节保存成功: ${chapter.title} (id: ${chapter.id})`;
  },
  {
    name: "save_chapter",
    description: "保存新章节到书籍",
    schema: z.object({
      bookId: z.string().describe("书籍 ID"),
      title: z.string().describe("章节标题"),
      content: z.string().describe("章节正文内容（Markdown）"),
      order: z.number().optional().describe("章节排序位置"),
    }),
  },
);

const updateChapterTool = tool(
  async ({ chapterId, content, title }) => {
    const updates: Record<string, any> = {};
    if (content !== undefined) updates.content = content;
    if (title !== undefined) updates.title = title;
    const result = bookService.updateChapter(chapterId, updates);
    if (!result) return "章节更新失败";
    return `章节更新成功: ${result.title}`;
  },
  {
    name: "update_chapter",
    description: "更新已有章节的内容或标题",
    schema: z.object({
      chapterId: z.string().describe("章节 ID"),
      content: z.string().optional().describe("新的章节内容"),
      title: z.string().optional().describe("新的章节标题"),
    }),
  },
);

const saveToMemoryTool = tool(
  async ({ key, content }) => {
    memoryService.create({
      id: `book-agent-${key}-${Date.now()}`,
      isFolder: 0,
      title: `[BookAgent] ${key}`,
      fileUrl: "",
      parentId: "root",
      created: Date.now(),
      updated: Date.now(),
      visitedTime: Date.now(),
      size: content.length,
      starred: 0,
    });
    return `已保存到记忆: ${key}`;
  },
  {
    name: "save_to_memory",
    description: "将重要信息保存到项目记忆中",
    schema: z.object({
      key: z.string().describe("记忆标识/标题"),
      content: z.string().describe("记忆内容"),
    }),
  },
);

const bookAgentTools = [getBookInfoTool, saveChapterTool, updateChapterTool, saveToMemoryTool];

const toolMap = new Map<string, (typeof bookAgentTools)[number]>();
for (const t of bookAgentTools) {
  toolMap.set(t.name, t);
}

// ──────────────────── State 定义 ────────────────────

interface BookAgentState {
  messages: BaseMessage[];
  currentPhase: string;
  bookId: string;
  chapterOrder: number;
  maxChapters: number;
  phaseHistory: string[];
  result: string;
}

const BookAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
  currentPhase: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "orchestrator",
  }),
  bookId: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "",
  }),
  chapterOrder: Annotation<number>({
    reducer: (_curr, prev) => prev,
    default: () => 1,
  }),
  maxChapters: Annotation<number>({
    reducer: (_curr, prev) => prev,
    default: () => 10,
  }),
  phaseHistory: Annotation<string[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
  result: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "",
  }),
});

// ──────────────────── Agent 节点工厂 ────────────────────

function createAgentNode(systemPrompt: string, tools?: typeof bookAgentTools) {
  return async (state: typeof BookAgentState.State) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (!lastMsg) return { messages: [] };

    const llm = new ChatOpenAI({
      modelName: (globalThis as any).__bookAgentModel || "qwen-plus",
      apiKey: (globalThis as any).__bookAgentApiKey || "",
      configuration: {
        baseURL: (globalThis as any).__bookAgentUrl || "",
      },
      temperature: 0.7,
      streaming: false,
    });

    const target = tools ? llm.bindTools(tools) : llm;
    const msgs = [new SystemMessage(systemPrompt), ...state.messages];
    const response = await target.invoke(msgs);

    return { messages: [response] };
  };
}

// ──────────────────── 路由逻辑 ────────────────────

function shouldContinue(state: typeof BookAgentState.State): string {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMsg?.tool_calls && lastMsg.tool_calls.length > 0) {
    return "tools";
  }
  return "route";
}

function routePhase(state: typeof BookAgentState.State): string {
  const phase = state.currentPhase;
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const content =
    typeof lastMsg?.content === "string"
      ? lastMsg.content
      : "";

  switch (phase) {
    case "orchestrator":
      if (content.includes("构思") || content.includes("大纲")) return "thinker";
      if (content.includes("完成") || content.includes("结束")) return END;
      return "orchestrator";
    case "thinker":
      return "orchestrator";
    case "writer":
      return "editor";
    case "editor":
      return "consistency";
    case "consistency":
      return "orchestrator";
    default:
      return END;
  }
}

function routeFromTools(state: typeof BookAgentState.State): string {
  return state.currentPhase;
}

// ──────────────────── 工具执行节点 ────────────────────

async function executeTools(
  state: typeof BookAgentState.State,
): Promise<Partial<BookAgentState>> {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const results: BaseMessage[] = [];

  for (const tc of lastMsg.tool_calls || []) {
    let result = "";
    try {
      const targetTool = toolMap.get(tc.name) as any;
      if (targetTool) {
        result = (await targetTool.invoke(tc.args)) as string;
      } else {
        result = `未知工具: ${tc.name}`;
      }
    } catch (e: any) {
      result = `工具执行错误: ${e.message}`;
    }
    results.push(
      new ToolMessage({
        content: result,
        tool_call_id: tc.id!,
        name: tc.name,
      }),
    );
  }

  return { messages: results };
}

// ──────────────────── 构建 Graph ────────────────────

function buildBookAgentGraph() {
  const orchestratorNode = createAgentNode(ORCHESTRATOR_PROMPT, bookAgentTools);
  const thinkerNode = createAgentNode(THINKER_PROMPT);
  const writerNode = createAgentNode(WRITER_PROMPT, bookAgentTools);
  const editorNode = createAgentNode(EDITOR_PROMPT);
  const consistencyNode = createAgentNode(CONSISTENCY_PROMPT);

  const workflow = new StateGraph(BookAgentState)
    .addNode("orchestrator", async (state) => {
      const result = await orchestratorNode(state);
      return { ...result, currentPhase: "orchestrator" };
    })
    .addNode("thinker", async (state) => {
      const result = await thinkerNode(state);
      return { ...result, currentPhase: "thinker" };
    })
    .addNode("writer", async (state) => {
      const result = await writerNode(state);
      return { ...result, currentPhase: "writer" };
    })
    .addNode("editor", async (state) => {
      const result = await editorNode(state);
      return { ...result, currentPhase: "editor" };
    })
    .addNode("consistency", async (state) => {
      const result = await consistencyNode(state);
      return { ...result, currentPhase: "consistency" };
    })
    .addNode("tools", executeTools)
    .addNode("route", () => ({}))

    .addEdge(START, "orchestrator")
    .addConditionalEdges("orchestrator", shouldContinue, {
      tools: "tools",
      route: "route",
    })
    .addConditionalEdges("thinker", shouldContinue, {
      tools: "tools",
      route: "route",
    })
    .addConditionalEdges("writer", shouldContinue, {
      tools: "tools",
      route: "route",
    })
    .addConditionalEdges("editor", shouldContinue, {
      tools: "tools",
      route: "route",
    })
    .addConditionalEdges("consistency", shouldContinue, {
      tools: "tools",
      route: "route",
    })
    .addConditionalEdges("tools", routeFromTools, {
      orchestrator: "orchestrator",
      thinker: "thinker",
      writer: "writer",
      editor: "editor",
      consistency: "consistency",
    })
    .addConditionalEdges("route", routePhase, {
      orchestrator: "orchestrator",
      thinker: "thinker",
      writer: "writer",
      editor: "editor",
      consistency: "consistency",
      [END]: END,
    });

  return workflow.compile();
}

// ──────────────────── Public API ────────────────────

export interface BookAgentRequest {
  userMessage: string;
  bookId: string;
  model: string;
  apiKey: string;
  url: string;
  res: ExpressResponse;
  abortController: AbortController;
}

export class BookAgentService {
  async run({
    userMessage,
    bookId,
    model,
    apiKey,
    url,
    res,
    abortController,
  }: BookAgentRequest): Promise<boolean> {
    (globalThis as any).__bookAgentModel = model;
    (globalThis as any).__bookAgentApiKey = apiKey;
    (globalThis as any).__bookAgentUrl = url;

    const graph = buildBookAgentGraph();

    const initMessages: BaseMessage[] = [
      new HumanMessage(
        `## 项目任务\n\n` +
          `书籍ID: ${bookId}\n\n` +
          `用户需求: ${userMessage}\n\n` +
          `请先调用 get_book_info 工具获取书籍信息，然后制定创作计划。`,
      ),
    ];

    try {
      const stream = await graph.stream(
        {
          messages: initMessages,
          currentPhase: "orchestrator",
          bookId,
          chapterOrder: 1,
          phaseHistory: [],
        },
        { recursionLimit: 50, signal: abortController.signal },
      );

      for await (const event of stream) {
        if (abortController.signal.aborted) {
          res.write("\n\n[任务已取消]");
          res.end();
          return false;
        }

        for (const [node, output] of Object.entries(event)) {
          if (node === "tools") {
            const toolOutput = output as { messages: BaseMessage[] };
            for (const msg of toolOutput.messages) {
              const text =
                typeof msg.content === "string"
                  ? msg.content
                  : JSON.stringify(msg.content);
              res.write(`\n[system] ${text}\n`);
            }
          }

          if (
            ["orchestrator", "thinker", "writer", "editor", "consistency"].includes(node)
          ) {
            const agentOutput = output as {
              messages: BaseMessage[];
              currentPhase?: string;
            };
            for (const msg of agentOutput.messages || []) {
              if (msg instanceof AIMessage) {
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                  for (const tc of msg.tool_calls) {
                    res.write(`\n[${node}:${tc.name}]\n`);
                  }
                } else if (msg.content) {
                  const content =
                    typeof msg.content === "string"
                      ? msg.content
                      : Array.isArray(msg.content)
                        ? msg.content
                            .filter((p: any) => p.type === "text")
                            .map((p: any) => p.text)
                            .join("")
                        : "";
                  if (content) {
                    res.write(`\n### [${node}]\n\n${content}\n`);
                  }
                }
              }
            }
          }
        }
      }

      res.write("\n\n[book-agent:done]");
      res.end();
      return true;
    } catch (error: any) {
      if (abortController.signal.aborted || error.name === "AbortError") {
        res.write("\n\n[任务已取消]");
      } else {
        logger.error("BookAgent 执行错误:", error);
        res.write(`\n\n[错误] ${error.message}`);
      }
      res.end();
      return false;
    }
  }
}
