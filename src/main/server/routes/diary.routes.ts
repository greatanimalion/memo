import express from 'express';
import { DiaryController } from '@main/server/controllers/diary.controller';
import { asyncHandler } from '@main/server/utils/asyncHandler';

const router = express.Router();
const diaryController = new DiaryController();

router.get('/diarys/:id', asyncHandler(diaryController.getById.bind(diaryController)));
router.put('/diarys/:id', asyncHandler(diaryController.update.bind(diaryController)));

export default router;
