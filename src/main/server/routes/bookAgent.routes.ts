import express from "express";
import { BookAgentController } from "@main/server/controllers/bookAgent.controller";
import { asyncHandler } from "@main/server/utils/asyncHandler";

const router = express.Router();
const bookAgentController = new BookAgentController();

router.get(
  "/books/:bookId/agents",
  asyncHandler(bookAgentController.getByBookId.bind(bookAgentController)),
);
router.get(
  "/book-agents/:id",
  asyncHandler(bookAgentController.getById.bind(bookAgentController)),
);
router.post(
  "/book-agents",
  asyncHandler(bookAgentController.create.bind(bookAgentController)),
);
router.put(
  "/book-agents/:id",
  asyncHandler(bookAgentController.update.bind(bookAgentController)),
);
router.delete(
  "/book-agents/:id",
  asyncHandler(bookAgentController.delete.bind(bookAgentController)),
);
router.delete(
  "/books/:bookId/agents",
  asyncHandler(bookAgentController.deleteByBookId.bind(bookAgentController)),
);

export default router;
