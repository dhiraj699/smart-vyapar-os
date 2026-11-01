import { Router } from 'express';
import { login, getMe, registerUser, listUsers } from '../controllers/authController.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Public: Login
router.post('/login', login);

// Authenticated: Get profile
router.get('/me', authenticate, requireAuth, getMe);

// Admin only: Register staff or list users
router.post('/register', authenticate, requireRole('admin'), registerUser);
router.get('/users', authenticate, requireRole('admin'), listUsers);

export default router;
