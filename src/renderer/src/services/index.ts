import axios, { type AxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "http://localhost:32068/",
  timeout: 30000,
});

async function request<T>(config: AxiosRequestConfig): Promise<T | null> {
  try {
    const response = await api(config);
    return response.data.data as T;
  } catch (error) {
    console.error(`[API] ${config.method?.toUpperCase()} ${config.url} failed:`, error);
    return null;
  }
}

export async function getAll<T>(url: string): Promise<T[]> {
  const data = await request<T[]>({ method: "GET", url });
  return data ?? [];
}

export async function getById<T>(url: string): Promise<T | null> {
  return request<T>({ method: "GET", url });
}

export async function createItem<T>(url: string, item: T): Promise<T | null> {
  return request<T>({ method: "POST", url, data: item });
}

export async function updateItem<T>(url: string, item: Partial<T>): Promise<T | null> {
  return request<T>({ method: "PUT", url, data: item });
}

export async function deleteItem(url: string): Promise<boolean> {
  try {
    const response = await api.delete(url);
    return response.data.code === 200;
  } catch {
    return false;
  }
}

export async function exportAll() {
  try {
    const response = await api.get("/api/storage");
    return response.data;
  } catch (error) {
    console.error("exportAll failed:", error);
    throw error;
  }
}

export async function memorySize() {
  try {
    const response = await api.get("/api/memorySize");
    return response.data;
  } catch (error) {
    console.error("memorySize failed:", error);
    throw error;
  }
}

export async function importAll(data: any) {
  try {
    const response = await api.post("/api/storage/restore", {
      restoreData: data,
    });
    return response.data;
  } catch (error) {
    console.error("importAll failed:", error);
    throw error;
  }
}

export default api;
