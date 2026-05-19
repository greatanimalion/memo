import express from 'express';
import { MemoryController } from '../controllers/memory.controller';

const router = express.Router();
const memoryController = new MemoryController();

router.get('/memorys', memoryController.getAll.bind(memoryController));
router.get('/memorys/:id', memoryController.getById.bind(memoryController));
router.get('/memorys/get_children/:id', memoryController.getChildren.bind(memoryController));
router.get('/memorys_recent', memoryController.getRecent.bind(memoryController));
router.get('/memorys_starred', memoryController.getStarred.bind(memoryController));
router.post('/memorys', memoryController.create.bind(memoryController));
router.put('/memorys/:id', memoryController.update.bind(memoryController));
router.delete('/memorys/:id', memoryController.delete.bind(memoryController));
router.post('/memory/star/:id', memoryController.toggleStar.bind(memoryController));

export default router;
