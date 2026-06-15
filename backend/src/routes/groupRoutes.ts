import { Router } from 'express';
import {
  createGroup,
  getGroups,
  getGroupDetail,
  updateGroup,
  deleteGroup,
  addMember,
  leaveGroup,
} from '../controllers/groupController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Apply authMiddleware globally to all group routes
router.use(authMiddleware as any);

router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:groupId', getGroupDetail);
router.put('/:groupId', updateGroup);
router.delete('/:groupId', deleteGroup);

// Member routes
router.post('/:groupId/members', addMember);
router.post('/:groupId/members/:userId/leave', leaveGroup);

export default router;
