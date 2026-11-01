import { Router } from 'express';
import { createPriceAlert, listPriceAlerts } from '../controllers/priceAlertController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Mandi price projections and purchase orders are restricted to Admin
router.use(authenticate, requireRole('admin'));

router.get('/', listPriceAlerts);
router.post('/', createPriceAlert);

export default router;
