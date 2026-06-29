export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const getModels = (
  type: "qwen-plus" | "glm-5.1" | "deepseek" | "openRouter",
) => {
  const configs: Record<string, { model: string; url: string }> = {
    "qwen-plus": {
      model: "qwen-plus",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    "glm-5.1": {
      model: "glm-5.1",
      url: "https://open.bigmodel.cn/api/paas/v4",
    },
    deepseek: {
      model: "deepseek-chat",
      url: "https://api.deepseek.com",
    },
    openRouter: {
      model: "openai/gpt-5.2",
      url: "https://openrouter.ai/api/v1",
    },
  };
  return configs[type] || configs["qwen-plus"];
};
