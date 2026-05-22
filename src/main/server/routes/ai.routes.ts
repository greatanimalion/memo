import express from 'express';
import { AIController } from '../controllers/ai.controller';

const router = express.Router();
const aiController = new AIController();

router.post('/chat-stream', aiController.chatStream.bind(aiController));
router.post('/chat-agent', aiController.chatAgent.bind(aiController));
router.get('/chat-cancel', aiController.cancelChat.bind(aiController));


export default router;
