import type { Response as ExpressResponse } from "express";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DiaryService } from "@main/server/services/diary.service";

const diaryService = new DiaryService();

const getTimeTool = tool(
  async () => new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
  {
    name: "get_time",
    description: "获取当前日期和时间",
    schema: z.object({}),
  },
);

const writeDiaryTool = tool(
  async ({ date, todos, note }) => {
    diaryService.update(date, {
      id: date,
      monthDiarys: { todos, note },
    });
    return `日记创建成功，日期：${date}`;
  },
  {
    name: "write_diary",
    description: "记录日记，需要传入日期、待办事项列表和日记备注",
    schema: z.object({
      date: z.string().describe("日记日期，格式必须为：YYYY-MM-DD"),
      todos: z
        .array(
          z.object({
            text: z.string().describe("待办事项内容描述"),
          }),
        )
        .describe("待办事项列表"),
      note: z.string().optional().describe("日记备注或总结内容"),
    }),
  },
);

const tools = [getTimeTool, writeDiaryTool];

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
});

const SYSTEM_PROMPT = `你是一个智能助手，可以调用工具来帮助用户。
可用工具：
- get_time: 查询现在时间
- write_diary: 写入未来规划
当用户询问相关信息时，请调用合适的工具。`;

function createAgentGraph(model: ChatOpenAI) {
  const llm = model.bindTools(tools);

  const agentNode = async (state: typeof GraphState.State) => {
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
  };

  const shouldContinue = (state: typeof GraphState.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    return END;
  };

  const toolNode = new ToolNode(tools);

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

export interface LangGraphRequest {
  userMessage: string;
  conversationHistory: { role: string; content: string }[];
  model: string;
  apiKey: string;
  url: string;
  res: ExpressResponse;
  abortController: AbortController;
}

export class LangGraphService {
  async runAgent({
    userMessage,
    conversationHistory,
    model,
    apiKey,
    url,
    res,
    abortController,
  }: LangGraphRequest): Promise<boolean> {
    const llm = new ChatOpenAI({
      modelName: model,
      apiKey,
      configuration: { baseURL: url },
      temperature: 0.7,
      streaming: false,
    });

    const graph = createAgentGraph(llm);

    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...conversationHistory.map(
        (m) =>
          m.role === "user"
            ? new HumanMessage(m.content)
            : new AIMessage(m.content),
      ),
      new HumanMessage(userMessage),
    ];

    try {
      const stream = await graph.stream(
        { messages },
        { recursionLimit: 10, signal: abortController.signal },
      );

      let finalContent = "";

      for await (const event of stream) {
        if (abortController.signal.aborted) {
          res.write("🛑 任务取消");
          res.end();
          return false;
        }

        for (const [node, output] of Object.entries(event)) {
          if (node === "tools") {
            const toolMsgs = (output as { messages: BaseMessage[] }).messages;
            for (const msg of toolMsgs) {
              res.write(`\n🔧 工具执行结果: ${msg.content}\n`);
            }
          }

          if (node === "agent") {
            const agentMsgs = (output as { messages: BaseMessage[] }).messages;
            for (const msg of agentMsgs) {
              if (msg instanceof AIMessage) {
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                  res.write(
                    `\n🤔 模型决定调用 ${msg.tool_calls.length} 个工具:\n`,
                  );
                  msg.tool_calls.forEach((tc, idx) => {
                    res.write(`   ${idx + 1}. ${tc.name}函数\n`);
                  });
                } else if (msg.content) {
                  finalContent = msg.content as string;
                }
              }
            }
          }
        }
      }

      if (finalContent) {
        res.write("\n✅ 模型生成最终回复\n");
        res.write(finalContent);
      }
      res.end();
      return true;
    } catch (error: any) {
      if (abortController.signal.aborted || error.name === "AbortError") {
        res.write("🛑 任务取消");
      } else {
        res.write(`\n❌ 发生错误: ${error.message}`);
      }
      res.end();
      return false;
    }
  }
}
