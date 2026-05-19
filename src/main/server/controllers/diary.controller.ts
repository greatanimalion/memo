import type { Request, Response } from 'express';
import { DiaryService } from '../services/diary.service';
import type { Diary } from '../../../types';

export class DiaryController {
  private diaryService: DiaryService;

  constructor() {
    this.diaryService = new DiaryService();
  }

  getAll(_req: Request, res: Response): void {
    try {
      const diarys = this.diaryService.getAll();
      res.json({ code: 200, data: diarys, message: 'success' });
    } catch (error) {
      console.error('获取日记列表失败:', error);
      res.status(500).json({ code: 500, error: '获取日记列表失败' });
    }
  }

  getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const diary = this.diaryService.getById(id);
      if (!diary) {
        res.status(404).json({ code: 404, error: '未找到指定的日记' });
        return;
      }
      res.json({ code: 200, data: diary, message: 'success' });
    } catch (error) {
      console.error('获取日记失败:', error);
      res.status(500).json({ code: 500, error: '获取日记失败' });
    }
  }

  create(req: Request, res: Response): void {
    try {
      const diaryData: Diary = req.body;
      const newDiary = this.diaryService.create(diaryData);
      res.status(201).json({ code: 201, data: newDiary, message: '日记创建成功' });
    } catch (error) {
      console.error('创建日记失败:', error);
      res.status(500).json({ code: 500, error: '创建日记失败' });
    }
  }

  update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const updateData: Diary = req.body;
      const updatedDiary = this.diaryService.update(id, updateData);
      if (!updatedDiary) {
        // 未找到指定的日记则创建新的日记
        const newDiary = this.diaryService.create(updateData);
        res.status(200).json({ code: 200, data: newDiary, message: '日记创建成功' });
        return;
      }

      res.json({ code: 200, data: updatedDiary, message: '日记更新成功' });
    } catch (error) {
      console.error('更新日记失败:', error);
      res.status(500).json({ code: 500, error: '更新日记失败' });
    }
  }

  delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const result = this.diaryService.delete(id);

      if (!result) {
        res.status(404).json({ code: 404, error: '未找到指定的日记' });
        return;
      }

      res.json({ code: 200, message: '日记删除成功' });
    } catch (error) {
      console.error('删除日记失败:', error);
      res.status(500).json({ code: 500, error: '删除日记失败' });
    }
  }

  setDayDiary(req: Request, res: Response): void {
    try {
      const { date, todos, note } = req.body;
      this.diaryService.setDayDiary(date, todos, note);
      res.json({ code: 200, message: '日记设置成功' });
    } catch (error) {
      console.error('设置日记失败:', error);
      res.status(500).json({ code: 500, error: '设置日记失败' });
    }
  }
}
