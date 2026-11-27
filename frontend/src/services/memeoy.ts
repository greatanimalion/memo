import api from ".";
import type { Memory } from "@type/memory";
import { getRelativePath } from "@renderer/utils";

/** 包裹请求：异常时打印日志并返回兜底值，消除重复的 try/catch 模板。 */
function withFallback<A extends unknown[], R>(request: (...args: A) => Promise<R>, fallback: R) {
  return async (...args: A): Promise<R> => {
    try {
      return await request(...args);
    } catch (error) {
      console.log(error);
      return fallback;
    }
  };
}

export const getMemorys = withFallback(async (): Promise<Memory[]> => {
  const response = await api.get("/api/memorys");
  return response.data.data;
}, []);

export const getMemorysStarred = withFallback(async (): Promise<Memory[]> => {
  const response = await api.get("/api/memorys_starred");
  return response.data.data;
}, []);

export const getRecentMemorys = withFallback(async (): Promise<Memory[]> => {
  const response = await api.get("/api/memorys_recent");
  return response.data.data;
}, []);

export const getMemoryById = withFallback<[string], Memory | null>(async (id) => {
  const response = await api.get("/api/memorys/" + id);
  return response.data.data;
}, null);

export const getMemoryChildById = withFallback(async (id: string): Promise<Memory[]> => {
  const response = await api.get("/api/memorys/get_children/" + id);
  return response.data.data;
}, []);

export const createMemory = withFallback(async (data: Memory): Promise<Memory> => {
  const response = await api.post("/api/memorys", data);
  return response.data.data;
}, {} as Memory);

export const updateMemory = withFallback<[string, Memory], { code: number; data: Memory }>(async (id, data) => {
  const response = await api.put("/api/memorys/" + id, data);
  return response.data;
}, {} as { code: number; data: Memory });

export const deleteMemory = withFallback<[string], any>(async (id) => {
  const response = await api.delete("/api/memorys/" + id);
  return response.data.data;
}, undefined);

export const starredMemory = withFallback(async (id: string): Promise<Memory> => {
  const response = await api.post("/api/memory/star/" + id);
  return response.data.data;
}, {} as Memory);

// 以下为一次性上传/删除，无兜底需求，保持原样
export const uploadImage = async (file): Promise<{ url: string; filename: string }> => {
  const imgData = new FormData();
  imgData.append("file", file);
  imgData.append("namespace", "note");
  const response = await api.post("/upload", imgData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data.data;
};

export const deleteFile = (url: string) => {
  api.delete("/deleteFile", {
    data: {
      filePath: getRelativePath(url).replace("/uploads", ""),
    },
  });
};
