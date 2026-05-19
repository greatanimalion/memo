import axios from 'axios';
import type { Response } from 'express';

export interface AIModelConfig {
  model: string;
  url: string;
}

export interface AIRequestError {
  error: string;
  solution?: string;
}

export class AIService {
  private abortController: AbortController | null = null;

  getModels(type: 'qwen-plus' | 'glm-5.1' | 'deepseek' | 'openRouter'): AIModelConfig {
    switch (type) {
      case 'qwen-plus':
        return {
          model: 'qwen-plus',
          url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        };
      case 'glm-5.1':
        return {
          model: 'glm-5.1',
          url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        };
      case 'deepseek':
        return {
          model: 'deepseek-chat',
          url: 'https://api.deepseek.com/chat/completions',
        };
      case 'openRouter':
        return {
          model: 'openai/gpt-5.2',
          url: 'https://openrouter.ai/api/v1/chat/completions',
        };
      default:
        return {
          model: 'qwen-plus',
          url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models/qwen-plus/download',
        };
    }
  }

  getErrorMessage(modelName: string, code: number, message: string): AIRequestError {
    const errorMap: Record<string, Record<number, AIRequestError>> = {
      'deepseek': {
        400: { error: '请求体格式错误', solution: '请根据错误信息提示修改请求体' },
        402: { error: '账户余额不足', solution: '请充值后再试' },
        401: { error: '认证失败', solution: '请检查您的 API key 是否正确' },
        403: { error: '权限不足', solution: '请确认您的 API key 是否有权限访问该模型' },
        429: { error: '请求过于频繁', solution: '请稍后再试' },
        500: { error: '服务器内部错误', solution: '请稍后再试' },
        503: { error: '服务器繁忙', solution: '请稍后再试' },
      },
      'qwen-plus': {
        400: { error: '请求体格式错误', solution: '请根据错误信息提示修改请求体' },
        402: { error: '账户余额不足', solution: '请充值后再试' },
        401: { error: '认证失败', solution: '请检查您的 API key 是否正确' },
        403: { error: '权限不足', solution: '请确认您的 API key 是否有权限访问该模型' },
        429: { error: '请求过于频繁', solution: '请稍后再试' },
        500: { error: '服务器内部错误', solution: '请稍后再试' },
        503: { error: '服务器繁忙', solution: '请稍后再试' },
      },
      'glm-5.1': {
        400: { error: '请求体格式错误', solution: '请根据错误信息提示修改请求体' },
        401: { error: '认证失败', solution: '请检查您的 API key 是否正确' },
        403: { error: '权限不足', solution: '请确认您的 API key 是否有权限访问该模型' },
        429: { error: '请求过于频繁', solution: '请稍后再试' },
        500: { error: '服务器内部错误', solution: '请稍后再试' },
        503: { error: '服务器繁忙', solution: '请稍后再试' },
      },
      'openRouter': {
        400: { error: '请求体格式错误', solution: '请根据错误信息提示修改请求体' },
        401: { error: '认证失败', solution: '请检查您的 API key 是否正确' },
        403: { error: '区域限制', solution: '当前地区无法访问该模型' },
        429: { error: '请求过于频繁', solution: '请稍后再试' },
        500: { error: '服务器内部错误', solution: '请稍后再试' },
      },
    };

    return errorMap[modelName]?.[code] || { error: message };
  }
  async chatStream(prompt: string, history: any[], model: string, apiKey: string, res: Response): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      res.status(200).json({ message: '已取消上一个请求' });
      return;
    }
    this.abortController = new AbortController();
    const MAX_HISTORY_LENGTH = 10;
    const recentHistory = history.slice(-MAX_HISTORY_LENGTH);
    const hasSystemMessage = recentHistory.some((msg: any) => msg.role === 'system');

    let messages = hasSystemMessage
      ? [...recentHistory]
      : [{ role: 'system', content: '你是一个中文 AI 助手。' }, ...recentHistory];
    const lastMessage = recentHistory[recentHistory.length - 1];
    if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== prompt) {
      messages.push({ role: 'user', content: prompt });
    }
    try {
      const config = this.getModels(model as any);
      const response = await axios({
        method: 'post',
        url: config.url,
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        data: {
          model: config.model,
          messages,
          stream: true,
        },
        signal: this.abortController.signal,
        responseType: 'stream',
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      response.data.on('data', (chunk: any) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                res.end();
                return;
              }
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.delta?.reasoning_content || '';
              if (content) {
                res.write(content);
              }
            }
          } catch {
            console.warn('⚠️ 跳过非 JSON 行:', line);
          }
        }
      });
      response.data.on('end', () => {
        this.abortController = null;
        res.end();
      });
      response.data.on('error', () => {
        this.abortController = null;
        res.end();
      });
    } catch (err: any) {
      this.abortController = null;
      const status = err.response?.status || 500;
      res.status(status).json(this.getErrorMessage(model, status, err.message));
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
