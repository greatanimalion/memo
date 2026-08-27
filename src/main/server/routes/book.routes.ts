import express, { Router } from "express";
import { BookController } from "@main/server/controllers/book.controller";
import { asyncHandler } from "@main/server/utils/asyncHandler";

const router: Router = express.Router();
const bookController = new BookController();

// ========== Book ==========
router.get("/books", asyncHandler(bookController.getAllBooks.bind(bookController)));
router.get("/books/:id", asyncHandler(bookController.getBookById.bind(bookController)));
router.get("/books/:id/detail", asyncHandler(bookController.getBookDetail.bind(bookController)));
router.post("/books", asyncHandler(bookController.createBook.bind(bookController)));
router.put("/books/:id", asyncHandler(bookController.updateBook.bind(bookController)));
router.delete("/books/:id", asyncHandler(bookController.deleteBook.bind(bookController)));

// ========== Chapter ==========
router.get("/books/:bookId/chapters", asyncHandler(bookController.getChapters.bind(bookController)));
router.get("/chapters/:id", asyncHandler(bookController.getChapterById.bind(bookController)));
router.post("/chapters", asyncHandler(bookController.createChapter.bind(bookController)));
router.put("/chapters/:id", asyncHandler(bookController.updateChapter.bind(bookController)));
router.delete("/chapters/:id", asyncHandler(bookController.deleteChapter.bind(bookController)));

// ========== Volume ==========
router.get("/books/:bookId/volumes", asyncHandler(bookController.getVolumes.bind(bookController)));
router.get("/volumes/:id", asyncHandler(bookController.getVolumeById.bind(bookController)));
router.post("/volumes", asyncHandler(bookController.createVolume.bind(bookController)));
router.put("/volumes/:id", asyncHandler(bookController.updateVolume.bind(bookController)));
router.delete("/volumes/:id", asyncHandler(bookController.deleteVolume.bind(bookController)));

export default router;
