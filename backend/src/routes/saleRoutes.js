import { Router } from 'express';
import { createBill } from '../controllers/saleController.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Store Owner (Admin) and Counter Staff can create bills
router.post('/create-bill', authenticate, requireAuth, requireRole('admin', 'staff'), createBill);

export default router;
