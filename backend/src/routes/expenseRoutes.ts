import { Router } from 'express';
import { createExpense, updateExpense, deleteExpense } from '../controllers/expenseController';
import { authMiddleware } from '../middleware/authMiddleware';

// We use { mergeParams: true } so we can access :groupId from parent group router mount
const router = Router({ mergeParams: true });

router.use(authMiddleware as any);

router.post('/', createExpense);
router.put('/:expenseId', updateExpense);
router.delete('/:expenseId', deleteExpense);

export default router;
