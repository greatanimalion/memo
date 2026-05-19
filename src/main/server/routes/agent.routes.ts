import express from 'express';
import { AgentController } from '../controllers/agent.controller';

const router = express.Router();
const agentController = new AgentController();

router.get('/agents', agentController.getAll.bind(agentController));
router.post('/agents', agentController.create.bind(agentController));
router.put('/agents/:id', agentController.update.bind(agentController));
router.delete('/agents/:id', agentController.delete.bind(agentController));

export default router;
