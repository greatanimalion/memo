import express from 'express';
import { SessionController } from '../controllers/session.controller';

const router = express.Router();
const sessionController = new SessionController();

router.get('/sessions', sessionController.getAll.bind(sessionController));
router.get('/sessions/:id', sessionController.getById.bind(sessionController));
router.post('/sessions', sessionController.create.bind(sessionController));
router.put('/sessions/:id', sessionController.update.bind(sessionController));
router.delete('/sessions/:id', sessionController.delete.bind(sessionController));

export default router;
