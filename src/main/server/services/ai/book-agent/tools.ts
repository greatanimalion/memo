import crypto from "node:crypto";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BookService } from "@main/server/services/book.service";

const bookService = new BookService();

// ──────────────────── 业务工具 ────────────────────

export const getBookInfoTool = tool(
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

export const saveChapterTool = tool(
  async ({ bookId, title, content, order }) => {
    const chapter = bookService.createChapter({
      id: crypto.randomUUID(),
      bookId,
      title,
      content,
      wordCount: content.length,
      order: order ?? 0,
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

export const updateChapterTool = tool(
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

export const bookAgentTools = [getBookInfoTool, saveChapterTool, updateChapterTool];

// ──────────────────── 路由工具 ────────────────────

export let pendingRoute: string | null = null;

export function setPendingRoute(route: string | null): void {
  pendingRoute = route;
}

export function resetPendingRoute(): void {
  pendingRoute = null;
}

export const routeTool = tool(
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

export const allTools = [...bookAgentTools, routeTool];

export const toolMap = new Map<string, (typeof allTools)[number]>();
for (const t of allTools) {
  toolMap.set(t.name, t);
}
