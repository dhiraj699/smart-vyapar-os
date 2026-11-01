import { Router } from 'express';
import { optimizeOrder } from '../controllers/analyticsController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Procurement optimization is restricted to Admin
router.use(authenticate, requireRole('admin'));

router.post('/optimize-order', optimizeOrder);

export default router;
