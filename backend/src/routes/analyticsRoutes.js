import { Router } from 'express';
import { getDeadCapital } from '../controllers/analyticsController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Dead capital shows purchase costs and locked wholesale money - Admin only!
router.use(authenticate, requireRole('admin'));

router.get('/dead-capital', getDeadCapital);

export default router;
