import { Router } from 'express';
import { handleChatMessage } from '../controllers/chatController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

// Apply authenticate so req.user is available for role-awareness
router.post('/message', authenticate, handleChatMessage);

export default router;
