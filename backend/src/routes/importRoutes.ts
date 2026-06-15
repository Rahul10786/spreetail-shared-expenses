import { Router } from 'express';
import multer from 'multer';
import { uploadCSV, confirmImport } from '../controllers/importController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware as any);

router.post('/', upload.single('file'), uploadCSV);
router.post('/:jobId/confirm', confirmImport);

export default router;
