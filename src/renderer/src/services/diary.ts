import { getById, updateItem } from ".";
import type { Diary } from "../types/common";

export const getDiaryById = (id: string) => getById<Diary>("/api/diarys/" + id);
export const updateDiary = (diary: Diary) => updateItem<Diary>("/api/diarys/" + diary.id, diary);
