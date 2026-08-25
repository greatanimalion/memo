import express from "express";
import { BookController } from "@main/server/controllers/book.controller";
import { asyncHandler } from "@main/server/utils/asyncHandler";

const router = express.Router();
const bookController = new BookController();

router.get("/books", asyncHandler(bookController.getAll.bind(bookController)));
router.get(
  "/books/:id",
  asyncHandler(bookController.getById.bind(bookController)),
);
router.post("/books", asyncHandler(bookController.create.bind(bookController)));
router.put(
  "/books/:id",
  asyncHandler(bookController.update.bind(bookController)),
);
router.delete(
  "/books/:id",
  asyncHandler(bookController.delete.bind(bookController)),
);

export default router;
