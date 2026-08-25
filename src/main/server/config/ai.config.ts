export interface AIModel {
  name: string;
  model: string;
  url: string;
}

export const aiModels: AIModel[] = [
  {
    name: "qwen-plus",
    model: "qwen-plus",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  },
  {
    name: "glm-5.1",
    model: "glm-5.1",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  },
  {
    name: "deepseek",
    model: "deepseek-chat",
    url: "https://api.deepseek.com/chat/completions",
  },
  {
    name: "openRouter",
    model: "openai/gpt-5.2",
    url: "https://openrouter.ai/api/v1/chat/completions",
  },
];
