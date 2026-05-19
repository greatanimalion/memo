import { DatabaseHelper } from '../db';
import type { Diary } from '../../../types';

export class DiaryRepository {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getAll(): Diary[] {
    return this.dbHelper.diary.getAllDiarys();
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

  delete(id: string): boolean {
    return this.dbHelper.diary.deleteDiary(id);
  }

  setDayDiary(date: string, todos: any[], note: string): void {
    const monthId = date.substring(0, 7);
    let month = this.getById(monthId);

    if (!month) {
      month = { id: monthId, monthDiarys: {} };
    }

    if (!month.monthDiarys[date]) {
      month.monthDiarys[date] = { todos: [], note: '' };
    }

    todos.forEach((todo) => {
      month!.monthDiarys[date].todos.push({
        id: Date.now().toString(),
        text: todo.text,
        completed: false,
      });
    });
    month.monthDiarys[date].note = note;

    if (this.getById(monthId) === undefined) {
      this.create(month);
    } else {
      this.update(monthId, month);
    }
  }
}