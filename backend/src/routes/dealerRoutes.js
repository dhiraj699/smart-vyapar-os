import { Router } from 'express';
import { createDealer, listDealers, getMyVendorPortal } from '../controllers/dealerController.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate, requireAuth);

// Vendor/Supplier portal view: accessible by Dealer persona & Store Owner
router.get('/my-portal', requireRole('dealer', 'admin'), getMyVendorPortal);

// Full dealer ledger and creation: Store Owner (Admin) only
router.get('/', requireRole('admin'), listDealers);
router.post('/', requireRole('admin'), createDealer);

export default router;
