import { Router } from 'express';
import { calculateRisk, getUdharUpiLink } from '../controllers/analyticsController.js';
import { createCustomer, listCustomers, lookupByPhone, settleUdhar } from '../controllers/customerController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

// Staff and Admin: Needed for billing and checkout
router.get('/by-phone/:phone', lookupByPhone);
router.get('/:id/upi-link', getUdharUpiLink);
router.post('/:id/settle', settleUdhar);

// Admin only: Detailed customer list, credit limits, and risk calculations
router.get('/', requireRole('admin'), listCustomers);
router.post('/', requireRole('admin'), createCustomer);
router.post('/calculate-risk', requireRole('admin'), calculateRisk);

export default router;
