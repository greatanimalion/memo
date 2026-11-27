/**
 * 后端 API 基地址解析。
 *
 * 后端默认监听 32068，端口被占用时会自动切换为空闲端口，
 * 因此前端不能写死端口：启动时通过 Wails 绑定 GetApiPort 获取实际端口，
 * 浏览器直接打开页面（无 Wails 运行时）时回退到默认端口。
 */

import { port as defaultPort } from "@renderer/constants";

let apiPort = defaultPort;
// 后端启动时生成的访问令牌，所有 API 请求需携带
let apiToken = "";
let initialized = false;

/**
 * 解析后端实际端口与访问令牌，必须在渲染 React / 发起任何请求之前调用。
 * @returns 后端实际监听的端口
 */
export async function initApiBase(): Promise<number> {
  if (initialized) return apiPort;
  initialized = true;
  try {
    const app = (window as any)?.go?.main?.App;
    if (app) {
      const [port, token] = await Promise.all([
        typeof app.GetApiPort === "function" ? app.GetApiPort() : undefined,
        typeof app.GetApiToken === "function" ? app.GetApiToken() : undefined,
      ]);
      if (typeof port === "number" && port > 0) {
        apiPort = port;
      }
      if (typeof token === "string") {
        apiToken = token;
      }
    }
  } catch (error) {
    // 获取失败时回退默认端口，避免应用直接白屏
    console.error("获取后端端口/令牌失败，使用默认端口:", error);
  }
  return apiPort;
}

/** 当前后端端口。 */
export function getApiPort(): number {
  return apiPort;
}

/** 当前后端访问令牌。 */
export function getApiToken(): string {
  return apiToken;
}

/** 需要自定义请求头的请求（axios 之外的 fetch）统一携带的鉴权头。 */
export function getAuthHeaders(): Record<string, string> {
  return apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
}

/** 当前后端基地址，如 http://127.0.0.1:32068。 */
export function getApiBase(): string {
  // 后端只监听 IPv4 回环地址，必须用 127.0.0.1 而不是 localhost
  //（localhost 可能解析到 ::1 导致连接失败）
  return `http://127.0.0.1:${apiPort}`;
}
