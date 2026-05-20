import express from 'express';
import { DiaryController } from '../controllers/diary.controller';

const router = express.Router();
const diaryController = new DiaryController();

router.get('/diarys/:id', diaryController.getById.bind(diaryController));
router.put('/diarys/:id', diaryController.update.bind(diaryController));



export default router;
