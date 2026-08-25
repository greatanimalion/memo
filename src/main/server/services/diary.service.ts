import { DiaryRepository } from "@main/server/repositories/diary.repository";
import type { Diary } from "@type";

export class DiaryService {
  private diaryRepository: DiaryRepository;

  constructor() {
    this.diaryRepository = new DiaryRepository();
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
}
