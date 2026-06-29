import api from ".";
import { Diary } from "../types/common";

//根据id获取一个月的diary
export async function getDiaryById(id: string): Promise<Diary | null> {
  try {
    const response = await api.get("/api/diarys/" + id);
    return response.data.data;
  } catch {
    return null;
  }
}

//更新会话
export async function updateDiary(diary: Diary): Promise<Diary> {
  const response = await api.put("/api/diarys/" + diary.id, diary);
  return response.data.data;
}
