import type { Response as ExpressResponse } from "express";
import crypto from "node:crypto";
import { StateGraph, START, END } from "@langchain/langgraph";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { BookService } from "@main/server/services/book.service";
import { BookAgentService } from "@main/server/services/bookAgent.service";
import { logger } from "@main/server/utils/logger";
import { sseWrite } from "@main/server/utils/response";

import { ORCHESTRATOR_PROMPT } from "./promot/orchestrator";
import { THINKER_PROMPT } from "./promot/thinker";
import { WRITER_PROMPT } from "./promot/writer";
import { EDITOR_PROMPT } from "./promot/editor";
import { CONSISTENCY_PROMPT } from "./promot/consistency";

import { BookAgentState } from "./state";
import { createAgentNode } from "./agents";
import { toolMap, resetPendingRoute, pendingRoute } from "./tools";
import type { BookAgentState as BookAgentStateType } from "./state";

const bookService = new BookService();
const bookAgentDBService = new BookAgentService();

// ──────────────────── 路由逻辑 ────────────────────

function hasValidToolCalls(state: BookAgentStateType): boolean {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  if (!lastMsg?.tool_calls?.length) return false;
  return lastMsg.tool_calls.some((tc) => tc.args && Object.keys(tc.args).length > 0);
}

function routePhase(state: BookAgentStateType): string {
  const phase = state.currentPhase;

  if (state.stepCount >= 20) {
    logger.info(`[route] stepCount=${state.stepCount} >= 20, 强制结束`);
    return END;
  }

  if (pendingRoute) {
    const target = pendingRoute;
    resetPendingRoute();
    if (target === "end") {
      logger.info(`[route] tool route → END`);
      return END;
    }
    logger.info(`[route] tool route → ${target}`);
    return target;
  }

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

async function executeSingleTool(
  tc: { name: string; args: Record<string, any>; id?: string },
  state: BookAgentStateType,
): Promise<ToolMessage> {
  if (tc.name === "get_book_info" && !tc.args?.bookId && state.bookId) {
    tc.args = { ...tc.args, bookId: state.bookId };
  }

  if (!tc.args || Object.keys(tc.args).length === 0) {
    logger.warn(`[tools] ${tc.name} 参数为空，跳过`);
    return new ToolMessage({
      content: `工具 ${tc.name} 的参数为空，已跳过。`,
      tool_call_id: tc.id!,
      name: tc.name,
    });
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
  return new ToolMessage({
    content: result,
    tool_call_id: tc.id!,
    name: tc.name,
  });
}

// 有依赖关系的工具需要串行执行
const SERIAL_TOOLS = new Set(["update_chapter"]);

async function executeTools(
  state: BookAgentStateType,
): Promise<Partial<BookAgentStateType>> {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMsg.tool_calls || [];

  // 检查是否有需要串行执行的工具
  const hasSerialTool = toolCalls.some((tc) => SERIAL_TOOLS.has(tc.name));

  let results: ToolMessage[];
  if (hasSerialTool || toolCalls.length <= 1) {
    // 串行执行
    results = [];
    for (const tc of toolCalls) {
      results.push(await executeSingleTool(tc, state));
    }
  } else {
    // 并行执行无依赖的工具
    results = await Promise.all(toolCalls.map((tc) => executeSingleTool(tc, state)));
  }

  return { messages: results };
}

// ──────────────────── 构建 Graph ────────────────────

function buildBookAgentGraph(res: ExpressResponse) {
  // 草稿章节 ID，用于增量保存
  let draftChapterId: string | null = null;

  const orchestratorNode = createAgentNode({ systemPrompt: ORCHESTRATOR_PROMPT, res, agentName: "orchestrator" });
  const thinkerNode = createAgentNode({ systemPrompt: THINKER_PROMPT, res, agentName: "thinker" });
  const writerNode = createAgentNode({ systemPrompt: WRITER_PROMPT, res, agentName: "writer" });
  const editorNode = createAgentNode({ systemPrompt: EDITOR_PROMPT, res, agentName: "editor" });
  const consistencyNode = createAgentNode({ systemPrompt: CONSISTENCY_PROMPT, res, agentName: "consistency" });

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
      
      // 过滤掉非正文内容（调度信息、route调用等）
      const isRealContent = content.length > 100 
        && !content.includes('route(')
        && !content.includes('<｜｜DSML｜｜')
        && !content.includes('已收到')
        && !content.includes('现调度')
        && !content.includes('调度 editor')
        && (content.includes('# 第') || content.includes('## 第') || content.includes('\n\n')); // 有标题或段落
      
      if (isRealContent) {
        const titleMatch = content.match(/#?\s*第[一二三四五六七八九十\d]+章\s*(.+)/i);
        const title = titleMatch ? titleMatch[1].trim() : `第${state.chapterOrder}章`;
        
        // 提取纯正文（去掉标题）
        const pureContent = content.replace(/^#?\s*第[一二三四五六七八九十\d]+章\s*.+\n+/i, '').trim();
        
        if (pureContent.length > 50) {
          // 如果有草稿章节，更新它；否则创建新章节
          if (draftChapterId) {
            try {
              bookService.updateChapter(draftChapterId, {
                title,
                content: pureContent,
                wordCount: pureContent.length,
              });
              logger.info(`[auto-save] 草稿章节已更新: ${title} (${pureContent.length}字)`);
            } catch (e: any) {
              logger.error(`[auto-save] 草稿章节更新失败: ${e.message}`);
            }
          } else {
            try {
              const chapter = bookService.createChapter({
                id: crypto.randomUUID(),
                bookId: state.bookId,
                title,
                content: pureContent,
                wordCount: pureContent.length,
                order: state.chapterOrder,
              });
              draftChapterId = chapter.id;
              logger.info(`[auto-save] 章节已保存: ${title} (${pureContent.length}字)`);
            } catch (e: any) {
              logger.error(`[auto-save] 章节保存失败: ${e.message}`);
            }
          }
        }
      } else {
        logger.info(`[auto-save] 跳过非正文内容 (${content.length}字)`);
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
    resetPendingRoute();

    const graph = buildBookAgentGraph(res);

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

    const initMessages: HumanMessage[] = [
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
        { recursionLimit: 200, signal: abortController.signal },
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
            const toolOutput = output as { messages: ToolMessage[] };
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
            const agentOutput = output as { messages: AIMessage[] };
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
