import type { Response as ExpressResponse } from "express";
import crypto from "crypto";
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
import { BookService } from "@main/server/services/book.service";
import { BookAgentService } from "@main/server/services/bookAgent.service";
import { logger } from "@main/server/utils/logger";
import { sseWrite } from "@main/server/utils/response";

import { ORCHESTRATOR_PROMPT } from "./orchestrator";
import { THINKER_PROMPT } from "./thinker";
import { WRITER_PROMPT } from "./writer";
import { EDITOR_PROMPT } from "./editor";
import { CONSISTENCY_PROMPT } from "./consistency";

const bookService = new BookService();
const bookAgentDBService = new BookAgentService();

// ──────────────────── 工具定义 ────────────────────

const getBookInfoTool = tool(
  async ({ bookId }) => {
    const detail = bookService.getBookDetail(bookId);
    if (!detail) return "未找到指定书籍";
    return JSON.stringify(
      {
        title: detail.title,
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

const bookAgentTools = [getBookInfoTool, saveChapterTool, updateChapterTool];

// ──────────────────── 路由工具 ────────────────────

let pendingRoute: string | null = null;

const routeTool = tool(
  async ({ target }) => {
    pendingRoute = target;
    if (target === "end") {
      return "流程已结束，所有工作已完成。";
    }
    return `已切换到 ${target}，请继续执行。`;
  },
  {
    name: "route",
    description: "控制流程走向。完成所有工作后必须调用此工具结束流程。",
    schema: z.object({
      target: z.enum(["thinker", "writer", "editor", "consistency", "orchestrator", "end"])
        .describe("目标阶段：thinker=构思, writer=撰写, editor=编辑, consistency=检查, orchestrator=总控, end=结束"),
    }),
  },
);

const allTools = [...bookAgentTools, routeTool];

const toolMap = new Map<string, (typeof allTools)[number]>();
for (const t of allTools) {
  toolMap.set(t.name, t);
}

// ──────────────────── State 定义 ────────────────────

interface BookAgentState {
  messages: BaseMessage[];
  currentPhase: string;
  bookId: string;
  chapterOrder: number;
  phaseHistory: string[];
  result: string;
  stepCount: number;
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
  phaseHistory: Annotation<string[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
  result: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "",
  }),
  stepCount: Annotation<number>({
    reducer: (curr, prev) => prev,
    default: () => 0,
  }),
});

// ──────────────────── Agent 节点工厂 ────────────────────

// ──────────────────── Deepseek DSML 格式解析 ────────────────────

function parseDSMLToolCalls(content: string): { name: string; args: Record<string, any>; id?: string }[] {
  const calls: { name: string; args: Record<string, any>; id?: string }[] = [];
  // 匹配 <｜｜DSML｜｜invoke name="xxx">...<｜｜DSML｜｜parameter name="key" ...>value</｜｜DSML｜｜parameter>...</｜｜DSML｜｜invoke>
  const invokeRegex = /<｜｜DSML｜｜invoke\s+name="([^"]+)">([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;
  let match: RegExpExecArray | null;
  while ((match = invokeRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const args: Record<string, any> = {};
    const paramRegex = /<｜｜DSML｜｜parameter\s+name="([^"]+)"(?:\s+string="true")?>([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = paramRegex.exec(body)) !== null) {
      args[pMatch[1]] = pMatch[2];
    }
    calls.push({ name, args, id: `dsml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
  }
  return calls;
}

// ──────────────────── Agent 节点工厂 ────────────────────

function createAgentNode(
  systemPrompt: string,
  res: ExpressResponse,
  agentName: string,
  tools: typeof allTools = allTools,
) {
  return async (state: typeof BookAgentState.State) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (!lastMsg) return { messages: [] };

    const llm = new ChatOpenAI({
      modelName: (globalThis as any).__bookAgentModel || "deepseek-v4-pro",
      apiKey: (globalThis as any).__bookAgentApiKey || "",
      configuration: {
        baseURL: (globalThis as any).__bookAgentUrl || "https://api.deepseek.com",
      },
      temperature: 0.7,
      streaming: true,
    });

    // deepseek streaming 时标准 tool_calls 参数为空，始终不绑 tools，靠 DSML 解析
    const target = llm;
    const msgs = [new SystemMessage(systemPrompt), ...state.messages];
    const stream = await target.stream(msgs);

    sseWrite(res, "agent", JSON.stringify({ name: agentName }));

    let fullContent = "";
    const toolCalls: { name: string; args: Record<string, any>; id?: string }[] = [];

    for await (const chunk of stream) {
      if (chunk.content) {
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
          fullContent += text;
          sseWrite(res, "message", text);
        }
      }
      if (chunk.tool_calls) {
        for (const tc of chunk.tool_calls) {
          const existing = toolCalls.find((t) => t.id && tc.id && t.id === tc.id);
          if (existing) {
            if (tc.args && typeof tc.args === "object") {
              existing.args = { ...existing.args, ...tc.args };
            } else if (typeof tc.args === "string") {
              try { existing.args = { ...existing.args, ...JSON.parse(tc.args) }; } catch {}
            }
          } else {
            let parsedArgs: Record<string, any> = {};
            if (tc.args && typeof tc.args === "object") {
              parsedArgs = { ...tc.args };
            } else if (typeof tc.args === "string") {
              try { parsedArgs = JSON.parse(tc.args); } catch { parsedArgs = {}; }
            }
            toolCalls.push({
              name: tc.name,
              args: parsedArgs,
              id: tc.id,
            });
          }
          sseWrite(res, "tool_call", JSON.stringify({ agent: agentName, name: tc.name }));
        }
      }
    }

    logger.info(`[${agentName}] 完整回复:`, fullContent.substring(0, 300) + (fullContent.length > 300 ? '...' : ''));
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        logger.info(`[${agentName}] 工具调用: ${tc.name}, args: ${JSON.stringify(tc.args)}`);
      }
    }

    // deepseek DSML 格式 tool_calls 解析
    if (fullContent.includes('<｜｜DSML｜｜tool_calls>')) {
      const dsmlCalls = parseDSMLToolCalls(fullContent);
      if (dsmlCalls.length > 0) {
        logger.info(`[${agentName}] 从 DSML 解析到 ${dsmlCalls.length} 个工具调用`);
        for (const dc of dsmlCalls) {
          // 去重：已有同名同参数的跳过
          const dup = toolCalls.find((t) => t.name === dc.name && JSON.stringify(t.args) === JSON.stringify(dc.args));
          if (!dup) {
            toolCalls.push(dc);
            logger.info(`[${agentName}] DSML 工具调用: ${dc.name}, args: ${JSON.stringify(dc.args)}`);
            sseWrite(res, "tool_call", JSON.stringify({ agent: agentName, name: dc.name }));
          }
        }
      }
    }

    const response = new AIMessage({
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    return { messages: [response] };
  };
}

// ──────────────────── 路由逻辑 ────────────────────

// 检查 AIMessage 是否有带有效参数的 tool_calls
function hasValidToolCalls(state: typeof BookAgentState.State): boolean {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  if (!lastMsg?.tool_calls?.length) return false;
  return lastMsg.tool_calls.some((tc) => tc.args && Object.keys(tc.args).length > 0);
}

function routePhase(state: typeof BookAgentState.State): string {
  const phase = state.currentPhase;

  if (state.stepCount >= 20) {
    logger.info(`[route] stepCount=${state.stepCount} >= 20, 强制结束`);
    return END;
  }

  // 优先使用路由工具的决策
  if (pendingRoute) {
    const target = pendingRoute;
    pendingRoute = null;
    if (target === "end") {
      logger.info(`[route] tool route → END`);
      return END;
    }
    logger.info(`[route] tool route → ${target}`);
    return target;
  }

  // 兜底：关键词匹配
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const content = typeof lastMsg?.content === "string" ? lastMsg.content : "";

  let next = "orchestrator";
  switch (phase) {
    case "thinker":
      next = "orchestrator";
      break;
    case "writer":
      next = "editor";
      break;
    case "editor":
      next = "consistency";
      break;
    case "consistency":
      next = "orchestrator";
      break;
    case "orchestrator":
    default:
      next = "thinker";
      break;
  }

  logger.info(`[route] phase=${phase}, stepCount=${state.stepCount}, fallback next=${next}`);
  return next;
}

// ──────────────────── 工具执行节点 ────────────────────

async function executeTools(
  state: typeof BookAgentState.State,
): Promise<Partial<BookAgentState>> {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const results: BaseMessage[] = [];

  for (const tc of lastMsg.tool_calls || []) {
    // 补全 get_book_info 缺失的 bookId
    if (tc.name === "get_book_info" && !tc.args?.bookId && state.bookId) {
      tc.args = { ...tc.args, bookId: state.bookId };
    }

    // 空参数时跳过
    if (!tc.args || Object.keys(tc.args).length === 0) {
      logger.warn(`[tools] ${tc.name} 参数为空，跳过`);
      results.push(
        new ToolMessage({
          content: `工具 ${tc.name} 的参数为空，已跳过。`,
          tool_call_id: tc.id!,
          name: tc.name,
        }),
      );
      continue;
    }

    let result = "";
    try {
      logger.info(`[tools] 执行 ${tc.name}, 参数: ${JSON.stringify(tc.args)}`);
      const targetTool = toolMap.get(tc.name) as any;
      if (targetTool) {
        result = (await targetTool.invoke(tc.args)) as string;
        logger.info(`[tools] ${tc.name} 返回: ${result.substring(0, 200)}`);
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

function buildBookAgentGraph(res: ExpressResponse) {
  const orchestratorNode = createAgentNode(ORCHESTRATOR_PROMPT, res, "orchestrator");
  const thinkerNode = createAgentNode(THINKER_PROMPT, res, "thinker");
  const writerNode = createAgentNode(WRITER_PROMPT, res, "writer");
  const editorNode = createAgentNode(EDITOR_PROMPT, res, "editor");
  const consistencyNode = createAgentNode(CONSISTENCY_PROMPT, res, "consistency");

  const workflow = new StateGraph(BookAgentState)
    .addNode("orchestrator", async (state) => {
      const result = await orchestratorNode(state);
      return { ...result, currentPhase: "orchestrator", phaseHistory: ["orchestrator"], stepCount: state.stepCount + 1 };
    })
    .addNode("thinker", async (state) => {
      const result = await thinkerNode(state);
      return { ...result, currentPhase: "thinker", phaseHistory: ["thinker"], stepCount: state.stepCount + 1 };
    })
    .addNode("writer", async (state) => {
      const result = await writerNode(state);
      const content = typeof result.messages?.[0]?.content === "string" ? result.messages[0].content : "";
      if (content.length > 100) {
        const titleMatch = content.match(/(?:标题|title)[：:]\s*(.+)/i);
        const title = titleMatch ? titleMatch[1].trim() : `第${state.chapterOrder}章`;
        try {
          bookService.createChapter({
            id: crypto.randomUUID(),
            bookId: state.bookId,
            title,
            content,
            wordCount: content.length,
            order: state.chapterOrder,
          });
          logger.info(`[auto-save] 章节已保存: ${title} (${content.length}字)`);
        } catch (e: any) {
          logger.error(`[auto-save] 章节保存失败: ${e.message}`);
        }
      }
      return { ...result, currentPhase: "writer", phaseHistory: ["writer"], stepCount: state.stepCount + 1, chapterOrder: state.chapterOrder + 1 };
    })
    .addNode("editor", async (state) => {
      const result = await editorNode(state);
      return { ...result, currentPhase: "editor", phaseHistory: ["editor"], stepCount: state.stepCount + 1 };
    })
    .addNode("consistency", async (state) => {
      const result = await consistencyNode(state);
      return { ...result, currentPhase: "consistency", phaseHistory: ["consistency"], stepCount: state.stepCount + 1 };
    })
    .addNode("tools", async (state) => {
      const result = await executeTools(state);
      return { ...result };
    })

    .addEdge(START, "orchestrator")

    // Agent → (有有效 tool_calls?) → tools → 回到 orchestrator；否则 → routePhase
    .addConditionalEdges("orchestrator", (state) => {
      return hasValidToolCalls(state) ? "tools" : routePhase(state);
    }, {
      tools: "tools",
      thinker: "thinker",
      writer: "writer",
      editor: "editor",
      consistency: "consistency",
      [END]: END,
    })
    .addConditionalEdges("thinker", (state) => {
      return hasValidToolCalls(state) ? "tools" : routePhase(state);
    }, {
      tools: "tools",
      orchestrator: "orchestrator",
      writer: "writer",
      editor: "editor",
      consistency: "consistency",
      [END]: END,
    })
    .addConditionalEdges("writer", (state) => {
      return hasValidToolCalls(state) ? "tools" : routePhase(state);
    }, {
      tools: "tools",
      orchestrator: "orchestrator",
      thinker: "thinker",
      editor: "editor",
      consistency: "consistency",
      [END]: END,
    })
    .addConditionalEdges("editor", (state) => {
      return hasValidToolCalls(state) ? "tools" : routePhase(state);
    }, {
      tools: "tools",
      orchestrator: "orchestrator",
      thinker: "thinker",
      writer: "writer",
      consistency: "consistency",
      [END]: END,
    })
    .addConditionalEdges("consistency", (state) => {
      return hasValidToolCalls(state) ? "tools" : routePhase(state);
    }, {
      tools: "tools",
      orchestrator: "orchestrator",
      thinker: "thinker",
      writer: "writer",
      editor: "editor",
      [END]: END,
    })
    // tools 执行完后回到触发它的 Agent
    .addEdge("tools", "orchestrator");

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

export class BookAgentRunner {
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
    pendingRoute = null;

    const graph = buildBookAgentGraph(res);

    // 创建对话记录
    const recordId = crypto.randomUUID();
    const conversationMessages: { agent: string; role: string; content: string; timestamp: number }[] = [];
    bookAgentDBService.create({
      id: recordId,
      bookId,
      title: userMessage.slice(0, 50),
      messages: [],
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    let bookInfo = "";
    try {
      const detail = bookService.getBookDetail(bookId);
      if (detail) {
        bookInfo =
          `书籍标题: ${detail.title}\n` +
          `简介: ${detail.description || "无"}\n` +
          `已有章节: ${detail.chapters?.length || 0}章\n` +
          (detail.chapters?.length
            ? detail.chapters.map((c) => `  - ${c.title} (${c.wordCount}字)`).join("\n")
            : "");
      } else {
        bookInfo = `未找到书籍 (ID: ${bookId})`;
      }
    } catch (e: any) {
      bookInfo = `获取书籍信息失败: ${e.message}`;
    }

    const initMessages: BaseMessage[] = [
      new HumanMessage(
        `## 项目任务\n\n` +
          `书籍ID: ${bookId}\n\n` +
          `${bookInfo}\n\n` +
          `用户需求: ${userMessage}\n\n` +
          `请根据以上信息制定创作计划，并调度各Agent执行。`,
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
          stepCount: 0,
        },
        { recursionLimit: 100, signal: abortController.signal },
      );

      let currentAgent = "orchestrator";

      for await (const event of stream) {
        if (abortController.signal.aborted) {
          sseWrite(res, "cancel", "任务已取消");
          sseWrite(res, "done", "[DONE]");
          bookAgentDBService.update(recordId, { status: "cancelled", messages: conversationMessages });
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
              sseWrite(res, "tool", JSON.stringify({ name: msg.name, result: text }));
              conversationMessages.push({
                agent: currentAgent,
                role: "tool",
                content: `[${msg.name}] ${text}`,
                timestamp: Date.now(),
              });
            }
          }

          if (node === "orchestrator" || node === "thinker" || node === "writer" || node === "editor" || node === "consistency") {
            currentAgent = node;
            const agentOutput = output as { messages: BaseMessage[] };
            for (const msg of agentOutput.messages) {
              if (msg instanceof AIMessage && msg.content) {
                const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
                conversationMessages.push({
                  agent: node,
                  role: "assistant",
                  content,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }
      }

      sseWrite(res, "done", "[DONE]");
      bookAgentDBService.update(recordId, { status: "done", messages: conversationMessages });
      res.end();
      return true;
    } catch (error: any) {
      if (abortController.signal.aborted || error.name === "AbortError") {
        sseWrite(res, "cancel", "任务已取消");
        bookAgentDBService.update(recordId, { status: "cancelled", messages: conversationMessages });
      } else {
        logger.error("BookAgent 执行错误:", error);
        sseWrite(res, "error", error.message);
        bookAgentDBService.update(recordId, { status: "error", messages: conversationMessages });
      }
      sseWrite(res, "done", "[DONE]");
      res.end();
      return false;
    }
  }
}
