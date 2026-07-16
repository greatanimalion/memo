import express from 'express';
import { AIController } from '@main/server/controllers/ai.controller';
import { asyncHandler } from '@main/server/utils/asyncHandler';

const router = express.Router();
const aiController = new AIController();

router.post('/chat-stream', asyncHandler(aiController.chatStream.bind(aiController)));
router.post('/chat-agent', asyncHandler(aiController.chatAgent.bind(aiController)));
router.get('/chat-cancel', asyncHandler(aiController.cancelChat.bind(aiController)));

export default router;
