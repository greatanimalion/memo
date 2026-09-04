import type { Response as ExpressResponse } from "express";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "@main/server/utils/logger";
import { sseWrite } from "@main/server/utils/response";
import type { BookAgentState } from "./state";
import { parseDSMLToolCalls, parseTextToolCalls } from "./dsml";

export interface AgentNodeOptions {
  systemPrompt: string;
  res: ExpressResponse;
  agentName: string;
}

export function createAgentNode(options: AgentNodeOptions) {
  const { systemPrompt, res, agentName } = options;

  return async (state: BookAgentState) => {
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

    // Fallback: 从文本中解析工具调用（处理模型未正确生成 tool_calls 的情况）
    if (toolCalls.length === 0) {
      const textCalls = parseTextToolCalls(fullContent);
      if (textCalls.length > 0) {
        logger.info(`[${agentName}] 从文本解析到 ${textCalls.length} 个工具调用`);
        for (const tc of textCalls) {
          toolCalls.push(tc);
          logger.info(`[${agentName}] 文本工具调用: ${tc.name}, args: ${JSON.stringify(tc.args)}`);
          sseWrite(res, "tool_call", JSON.stringify({ agent: agentName, name: tc.name }));
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
