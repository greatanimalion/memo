import { DiaryRepository } from '../repositories/diary.repository';
import type { Diary } from '../../../types';

export class DiaryService {
  private diaryRepository: DiaryRepository;

  constructor() {
    this.diaryRepository = new DiaryRepository();
  }

  getAll(): Diary[] {
    return this.diaryRepository.getAll();
  }

  getById(id: string): Diary | null {
    return this.diaryRepository.getById(id) || null;
  }

  create(data: Diary): Diary {
    return this.diaryRepository.create(data);
  }

  update(id: string, data: Partial<Diary>): Diary | null {
    return this.diaryRepository.update(id, data);
  }

  delete(id: string): boolean {
    return this.diaryRepository.delete(id);
  }

  setDayDiary(date: string, todos: any[], note: string): void {
    this.diaryRepository.setDayDiary(date, todos, note);
  }
}
