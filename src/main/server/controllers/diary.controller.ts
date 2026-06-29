import type { Request, Response } from 'express';
import { DiaryService } from '../services/diary.service';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import type { Diary } from '../../../types';

export class DiaryController {
  private diaryService: DiaryService;

  constructor() {
    this.diaryService = new DiaryService();
  }
  getById(req: Request, res: Response): void {
    const { id } = req.params;
    const diary = this.diaryService.getById(id);
    if (!diary) {
      errorResponse(res, 404, '未找到指定的日记');
      return;
    }
    successResponse(res, diary);
  }

  create(req: Request, res: Response): void {
    const diaryData: Diary = req.body;
    const newDiary = this.diaryService.create(diaryData);
    createdResponse(res, newDiary, '日记创建成功');
  }

  update(req: Request, res: Response): void {
    const { id } = req.params;
    const updateData: Diary = req.body;
    const updatedDiary = this.diaryService.update(id, updateData);
    if (!updatedDiary) {
      const newDiary = this.diaryService.create(updateData);
      successResponse(res, newDiary, '日记创建成功');
      return;
    }
    successResponse(res, updatedDiary, '日记更新成功');
  }
}
