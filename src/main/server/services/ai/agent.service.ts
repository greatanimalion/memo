import type { Response as ExpressResponse } from 'express';
import { DiaryService } from '@main/server/services/diary.service';

export const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_time',
      description: '获取当前时间',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: '创建文件，并输入文件内容，需要传入文件名以及文件内容',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '文件名' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_diary',
      description: '记录日记，需要传入日期、待办事项列表和日记备注',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日记日期，格式必须为：YYYY-MM-DD' },
          todos: {
            type: 'array',
            description: '待办事项列表',
            items: {
              type: 'object',
              properties: { text: { type: 'string', description: '待办事项内容描述' } },
              required: ['text'],
            },
          },
          note: { type: 'string', description: '日记备注或总结内容' },
        },
        required: ['date', 'todos'],
      },
    },
  },
];

export class AgentToolService {
  private diaryService: DiaryService;

  constructor() {
    this.diaryService = new DiaryService();
  }

  async executeToolCall(toolCall: any): Promise<string> {
    const functionName = toolCall.function.name;
    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return JSON.stringify({ error: `无法解析工具参数: ${toolCall.function.arguments}` });
    }
    try {
      switch (functionName) {
        case 'get_time':
          return Date().toString();

        // case 'write_file':
        //   const memoryData: Memory = {
        //     id: 'ai_' + Date.now(),
        //     isFolder: 0,
        //     title: args.filename,
        //     content: args.content,
        //     parentId: 'root',
        //     created: Date.now(),
        //     updated: Date.now(),
        //     visitedTime: Date.now(),
        //     size: args.content.length.toString(),
        //     starred: 0,
        //   };
        //    this.memoryService.create(memoryData);
        //   return `文件创建完成，并已写入文件: ${args.filename}`;

        case 'write_diary':
           this.diaryService.update(args.date, { id: args.date, monthDiarys: { todos: args.todos, note: args.note } });
          return `日记创建成功，日期：${args.date}`;

        default:
          return JSON.stringify({ error: `未知工具: ${functionName}` });
      }
    } catch (e: any) {
      return JSON.stringify({ error: `工具执行失败: ${e.message || e}` });
    }
  }

  async callDeepSeek(
    messages: any[],
    model: string,
    apiKey: string,
    url: string,
    abortController: AbortController
  ): Promise<any> {
    const requestBody = {
      model,
      messages,
      tools,
      tool_choice: 'auto' as const,
      temperature: 0.7,
      stream: false,
    };

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`API 网络请求失败: ${error.message}`);
    }

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch {
        errorText = '无法读取错误响应';
      }
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('API 响应 JSON 解析失败');
    }

    if (!data.choices?.[0]?.message) {
      throw new Error('API 响应结构异常: 缺少 choices[0].message');
    }
    return data.choices[0].message;
  }

  async runAgent(
    userMessage: string,
    conversationHistory: any[],
    model: string,
    apiKey: string,
    url: string,
    res: ExpressResponse,
    abortController: AbortController,
    maxRounds: number = 5
  ): Promise<boolean> {
    const messages = [
      {
        role: 'system',
        content: `你是一个智能助手，可以调用工具来帮助用户。
可用工具：
- get_time: 查询现在时间
- write_file: 创建文件并写入内容
- write_diary: 写入未来规划
当用户询问相关信息时，请调用合适的工具。`,
      },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    let currentMessages = [...messages];
    let roundCount = 0;

    try {
      while (roundCount < maxRounds) {
        if (abortController.signal.aborted) {
          res.write('🛑 任务取消');
          res.end();
          return false;
        }

        roundCount++;
        const assistantMessage = await this.callDeepSeek(currentMessages, model, apiKey, url, abortController);
        currentMessages.push(assistantMessage);

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          res.write(`\n🤔 模型决定调用 ${assistantMessage.tool_calls.length} 个工具:`);
          assistantMessage.tool_calls.forEach((tc: any, idx: number) => {
            res.write(`   ${idx + 1}. ${tc.function.name}函数\n`);
          });

          for (const toolCall of assistantMessage.tool_calls) {
            const toolResult = await this.executeToolCall(toolCall);
            res.write('\n' + toolResult + '\n');
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            });
          }
          continue;
        }

        res.write('\n✅ 模型生成最终回复\n');
        res.write(assistantMessage.content);
        res.end();
        return true;
      }

      res.write('\n⚠️ 已达到最大对话轮次限制\n');
      res.end();
      return false;
    } catch (error: any) {
      if (abortController.signal.aborted) {
        res.write('🛑 任务取消');
      } else {
        res.write(`\n❌ 发生错误: ${error.message}`);
      }
      res.end();
      return false;
    }
  }
}
