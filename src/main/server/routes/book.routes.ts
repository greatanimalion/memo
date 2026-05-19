import express from 'express';
import { BookController } from '../controllers/book.controller';

const router = express.Router();
const bookController = new BookController();

router.get('/books', bookController.getAll.bind(bookController));
router.get('/books/:id', bookController.getById.bind(bookController));
router.post('/books', bookController.create.bind(bookController));
router.put('/books/:id', bookController.update.bind(bookController));
router.delete('/books/:id', bookController.delete.bind(bookController));

export default router;