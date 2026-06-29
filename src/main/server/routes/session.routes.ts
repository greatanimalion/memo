import express from 'express';
import { SessionController } from '../controllers/session.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const sessionController = new SessionController();

router.get('/sessions', asyncHandler(sessionController.getAll.bind(sessionController)));
router.get('/sessions/:id', asyncHandler(sessionController.getById.bind(sessionController)));
router.post('/sessions', asyncHandler(sessionController.create.bind(sessionController)));
router.put('/sessions/:id', asyncHandler(sessionController.update.bind(sessionController)));
router.delete('/sessions/:id', asyncHandler(sessionController.delete.bind(sessionController)));

export default router;
