import { DatabaseHelper } from '@main/server/db';
import type { Diary } from '@type';

export class DiaryRepository {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getById(id: string): Diary | undefined {
    return this.dbHelper.diary.findDiaryById(id);
  }
  create(diary: Diary): Diary {
    return this.dbHelper.diary.addDiary(diary);
  }
  update(id: string, updates: Partial<Diary>): Diary | null {
    return this.dbHelper.diary.updateDiary(id, updates);
  }
}