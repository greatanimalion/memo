import express from 'express';
import { DiaryController } from '../controllers/diary.controller';

const router = express.Router();
const diaryController = new DiaryController();

router.get('/diarys', diaryController.getAll.bind(diaryController));
router.get('/diarys/:id', diaryController.getById.bind(diaryController));
router.post('/diarys', diaryController.create.bind(diaryController));
router.put('/diarys/:id', diaryController.update.bind(diaryController));
router.delete('/diarys/:id', diaryController.delete.bind(diaryController));
router.post('/diarys/set_day', diaryController.setDayDiary.bind(diaryController));

export default router;
