import { Router } from 'express';
import {
  createProduct,
  deleteProduct,
  getLowStock,
  listProducts,
  restockProduct,
  searchProducts,
  updateProduct,
  seedStressTest,
} from '../controllers/productController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Apply authenticate to all product routes so req.user is populated if token is present
router.use(authenticate);

// Public / Staff-accessible read routes (masked automatically for staff)
router.get('/low-stock', getLowStock);
router.get('/search', searchProducts);
router.get('/', listProducts);

// Admin-only endpoints
router.post('/seed-stress-test', requireRole('admin'), seedStressTest);
router.post('/', requireRole('admin'), createProduct);
router.put('/:id', requireRole('admin'), updateProduct);
router.post('/:id/restock', restockProduct); // staff can also restock physical units
router.delete('/:id', requireRole('admin'), deleteProduct);

export default router;
