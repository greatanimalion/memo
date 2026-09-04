export interface DSMLToolCall {
  name: string;
  args: Record<string, any>;
  id?: string;
}

// 工具参数类型定义
const TOOL_PARAM_TYPES: Record<string, Record<string, string>> = {
  get_book_info: { bookId: "string" },
  save_chapter: { bookId: "string", title: "string", content: "string", order: "number" },
  update_chapter: { chapterId: "string", title: "string", content: "string" },
  route: { target: "string" },
};

/**
 * 转换参数类型
 */
function convertArgType(value: string, toolName: string, paramName: string): any {
  const typeDef = TOOL_PARAM_TYPES[toolName];
  if (!typeDef || !typeDef[paramName]) {
    // 尝试自动推断
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  
  switch (typeDef[paramName]) {
    case "number":
      const num = parseInt(value, 10);
      return isNaN(num) ? 0 : num;
    case "boolean":
      return value === "true";
    default:
      return value;
  }
}

export function parseDSMLToolCalls(content: string): DSMLToolCall[] {
  const calls: DSMLToolCall[] = [];
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
      const paramName = pMatch[1];
      const paramValue = pMatch[2];
      // 如果参数有 string="true" 属性，保持字符串；否则尝试类型转换
      if (pMatch[0].includes('string="true"')) {
        args[paramName] = paramValue;
      } else {
        args[paramName] = convertArgType(paramValue, name, paramName);
      }
    }
    calls.push({ name, args, id: `dsml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
  }
  return calls;
}

/**
 * Fallback: 从文本内容中解析工具调用
 * 处理模型没有正确生成 tool_calls 格式的情况
 */
export function parseTextToolCalls(content: string): DSMLToolCall[] {
  const calls: DSMLToolCall[] = [];
  
  // 匹配 JSON 格式的工具调用: tool_name({ "key": "value" })
  const jsonCallRegex = /(\w+)\s*\(\s*(\{[^}]+\})\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = jsonCallRegex.exec(content)) !== null) {
    const name = match[1];
    try {
      const args = JSON.parse(match[2]);
      calls.push({ name, args, id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
    } catch {}
  }
  
  // 如果没有匹配到 JSON 格式，尝试匹配简单的工具调用模式
  if (calls.length === 0) {
    // 匹配 "调用 xxx 工具" 或 "call xxx" 等模式
    const simpleCallRegex = /(?:调用|call|invoke)\s+[`"']?(\w+)[`"']?\s*(?:工具|tool)?/gi;
    while ((match = simpleCallRegex.exec(content)) !== null) {
      const name = match[1].toLowerCase();
      // 根据工具名称推断参数
      const args = inferToolArgs(name, content);
      if (args) {
        calls.push({ name, args, id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
      }
    }
  }
  
  return calls;
}

/**
 * 根据工具名称和上下文推断参数
 */
function inferToolArgs(toolName: string, content: string): Record<string, any> | null {
  switch (toolName) {
    case "get_book_info": {
      // 尝试从上下文中提取 bookId
      const bookIdMatch = content.match(/书籍ID[：:]\s*[`"']?([a-f0-9-]+)[`"']?/i);
      if (bookIdMatch) {
        return { bookId: bookIdMatch[1] };
      }
      return {}; // bookId 会在 executeTools 中从 state 补全
    }
    case "route": {
      // 尝试从上下文中提取 target
      const targetMatch = content.match(/(?:目标|target)[：:]\s*[`"']?(\w+)[`"']?/i);
      if (targetMatch) {
        return { target: targetMatch[1] };
      }
      return null;
    }
    case "save_chapter": {
      // 保存章节需要完整参数，无法从简单文本推断
      return null;
    }
    case "update_chapter": {
      // 更新章节需要完整参数，无法从简单文本推断
      return null;
    }
    default:
      return null;
  }
}
