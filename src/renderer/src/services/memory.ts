import api from ".";
import type { Memory } from "../../../types";

export const getMemorys = async (): Promise<Memory[]> => {
  try {
    const response = await api.get("/api/memorys");
    return response.data.data;
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const getMemorysStarred = async (): Promise<Memory[]> => {
  try {
    const response = await api.get("/api/memorys_starred");
    return response.data.data;
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const getRecentMemorys = async (): Promise<Memory[]> => {
  try {
    const response = await api.get("/api/memorys_recent");
    return response.data.data;
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const getMemoryById = async (id: string): Promise<Memory | null> => {
  try {
    const response = await api.get("/api/memorys/" + id);
    return response.data.data;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const getMemoryChildById = async (id: string): Promise<Memory[]> => {
  try {
    const response = await api.get("/api/memorys/get_children/" + id);
    return response.data.data;
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const createMemory = async (data: Memory): Promise<Memory> => {
  try {
    const response = await api.post("/api/memorys", data);
    return response.data.data;
  } catch (error) {
    console.log(error);
    return {} as Memory;
  }
};

export const updateMemory = async (
  id: string,
  data: Memory,
): Promise<Memory> => {
  try {
    const response = await api.put("/api/memorys/" + id, data);
    return response.data.data;
  } catch (error) {
    console.log(error);
    return {} as Memory;
  }
};

export const deleteMemory = async (id: string): Promise<any> => {
  try {
    const response = await api.delete("/api/memorys/" + id);
    return response.data.data;
  } catch (error) {
    console.log(error);
  }
};

export const uploadImage = async (
  file,
): Promise<{ url: string; filename: string }> => {
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
      filePath: url.replace("http://localhost:32068/uploads", ""),
    },
  });
};
export const starredMemory = async (id: string): Promise<Memory> => {
  try {
    const response = await api.post("/api/memory/star/" + id);
    return response.data.data;
  } catch (error) {
    console.log(error);
    return {} as Memory;
  }
};
