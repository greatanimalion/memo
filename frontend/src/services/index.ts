// import { port } from "@renderer/constants";
import axios from "axios";
import { getApiBase, getApiToken } from "@renderer/utils/apiBase";

// 端口在启动时动态解析（默认端口可能被占用），这里用运行时基地址初始化
const api = axios.create({
  baseURL: `${getApiBase()}/`,
});

// 所有请求统一携带后端下发的访问令牌
api.interceptors.request.use((config) => {
  const token = getApiToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** 端口解析完成后同步 axios 基地址（main.tsx 启动时调用）。 */
export function syncApiBase() {
  api.defaults.baseURL = `${getApiBase()}/`;
}

export async function exportAll() {
  const response = await api.get("/api/storage");
  return response.data;
}
export async function memerySize() {
  const response = await api.get("/api/memorySize");
  return response.data;
}
export async function importAll(data: any) {
  const response = await api.post("/api/storage/restore", {
    restoreData: data,
  });
  return response.data;
}
export default api;
