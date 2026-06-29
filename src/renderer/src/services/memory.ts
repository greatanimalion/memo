import api, { getAll, getById, createItem, updateItem, deleteItem } from ".";
import type { Memory } from "../../../types";

export const getMemorys = () => getAll<Memory>("/api/memorys");
export const getMemorysStarred = () => getAll<Memory>("/api/memorys_starred");
export const getRecentMemorys = () => getAll<Memory>("/api/memorys_recent");
export const getMemoryById = (id: string) => getById<Memory>("/api/memorys/" + id);
export const getMemoryChildById = (id: string) => getAll<Memory>("/api/memorys/get_children/" + id);
export const createMemory = (data: Memory) => createItem("/api/memorys", data);
export const updateMemory = (id: string, data: Memory) => updateItem<Memory>("/api/memorys/" + id, data);
export const deleteMemory = (id: string) => deleteItem("/api/memorys/" + id);

export const uploadImage = async (file: File): Promise<{ url: string; filename: string }> => {
  const imgData = new FormData();
  imgData.append("file", file);
  imgData.append("namespace", "note");
  const response = await api.post("/upload", imgData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.data;
};

export const deleteFile = (url: string) => {
  api.delete("/deleteFile", {
    data: { filePath: url.replace("http://localhost:32068/uploads", "") },
  });
};

export const starredMemory = async (id: string): Promise<Memory | null> => {
  try {
    const response = await api.post("/api/memory/star/" + id);
    return response.data.data;
  } catch {
    return null;
  }
};
