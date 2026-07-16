import express from 'express';
import { MemoryController } from '@main/server/controllers/memory.controller';
import { asyncHandler } from '@main/server/utils/asyncHandler';

const router = express.Router();
const memoryController = new MemoryController();

router.get('/memorys', asyncHandler(memoryController.getAll.bind(memoryController)));
router.get('/memorys/:id', asyncHandler(memoryController.getById.bind(memoryController)));
router.get('/memorys/get_children/:id', asyncHandler(memoryController.getChildren.bind(memoryController)));
router.get('/memorys_recent', asyncHandler(memoryController.getRecent.bind(memoryController)));
router.get('/memorys_starred', asyncHandler(memoryController.getStarred.bind(memoryController)));
router.post('/memorys', asyncHandler(memoryController.create.bind(memoryController)));
router.put('/memorys/:id', asyncHandler(memoryController.update.bind(memoryController)));
router.delete('/memorys/:id', asyncHandler(memoryController.delete.bind(memoryController)));
router.post('/memory/star/:id', asyncHandler(memoryController.toggleStar.bind(memoryController)));

export default router;
