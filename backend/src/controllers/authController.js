import { z } from 'zod';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Dealer from '../models/Dealer.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(500, 'JWT_SECRET environment variable is missing');
    }
    return 'vyapar_dev_secret_insecure';
  }
  return secret;
};

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const loginSchema = z
  .object({
    identifier: z.string().trim().optional(),
    username: z.string().trim().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((d) => Boolean(d.identifier || d.username), {
    message: 'Username or phone number is required',
    path: ['identifier'],
  });

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(50).toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'staff', 'dealer']).default('staff'),
  phone: z.string().trim().optional(),
  dealerId: z.string().trim().optional(),
});

export const login = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const idKey = (body.identifier || body.username || '').trim();
  const password = body.password;

  // Search by username or phone
  const user = await User.findOne({
    $or: [{ username: idKey.toLowerCase() }, { phone: idKey }],
    active: true,
  }).populate('dealerId', 'name agencyName phone pendingBalance categories');

  if (!user) {
    throw new ApiError(401, 'Invalid username/phone or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid username/phone or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = jwt.sign(
    {
      id: user._id.toString(),
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
      dealerId: user.dealerId?._id || user.dealerId || null,
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );

  logger.info(`User login success: ${user.username} [${user.role}] (ID: ${user._id})`);

  res.json({
    success: true,
    message: `Welcome ${user.name} (${user.role.toUpperCase()})`,
    token,
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
      dealer: user.dealerId || null,
    },
  });
});

export const getMe = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const user = await User.findById(req.user.id)
    .select('-password')
    .populate('dealerId', 'name agencyName phone pendingBalance categories');

  if (!user || !user.active) {
    throw new ApiError(404, 'User not found or inactive');
  }

  res.json({
    success: true,
    data: user,
  });
});

export const registerUser = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await User.findOne({ username: data.username });
  if (existing) {
    throw new ApiError(409, `Username "${data.username}" is already taken`);
  }

  const user = await User.create(data);
  logger.info(`New user registered: ${user.username} [${user.role}]`);

  res.status(201).json({
    success: true,
    message: `Account created for ${user.name} (${user.role})`,
    data: {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
      dealerId: user.dealerId,
    },
  });
});

export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({})
    .select('-password')
    .populate('dealerId', 'name agencyName')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: users.length,
    data: users,
  });
});

/**
 * Initializes default persona accounts from environment variables (.env)
 * 1. Admin: process.env.ADMIN_USERNAME / process.env.ADMIN_PASSWORD
 * 2. Staff: process.env.STAFF_USERNAME / process.env.STAFF_PASSWORD
 * 3. Dealer: process.env.DEALER_USERNAME / process.env.DEALER_PASSWORD
 */
export const ensureDefaultAccounts = async () => {
  try {
    // 1. Admin Persona (Store Owner)
    const adminUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || process.env.SHOP_NAME || 'Store Owner';
    const adminPhone = process.env.ADMIN_PHONE || process.env.SHOP_PHONE || '';

    if (adminPass) {
      let admin = await User.findOne({ username: adminUser });
      if (!admin) {
        admin = await User.create({
          name: adminName,
          username: adminUser,
          password: adminPass,
          role: 'admin',
          phone: adminPhone,
        });
        logger.info(`Default Admin account initialized: ${adminUser}`);
      } else if (admin.name !== adminName && adminName) {
        admin.name = adminName;
        if (adminPhone) admin.phone = adminPhone;
        await admin.save();
      }
    }

    // 2. Staff Persona (Counter Cashier)
    const staffUser = (process.env.STAFF_USERNAME || 'staff').trim().toLowerCase();
    const staffPass = process.env.STAFF_PASSWORD;
    const staffName = process.env.STAFF_NAME || 'Counter Cashier';
    const staffPhone = process.env.STAFF_PHONE || '';

    if (staffPass) {
      const staffExists = await User.findOne({ username: staffUser });
      if (!staffExists) {
        await User.create({
          name: staffName,
          username: staffUser,
          password: staffPass,
          role: 'staff',
          phone: staffPhone,
        });
        logger.info(`Default Staff account initialized: ${staffUser}`);
      }
    }

    // 3. Dealer Persona (Supplier)
    const dealerUser = (process.env.DEALER_USERNAME || 'dealer').trim().toLowerCase();
    const dealerPass = process.env.DEALER_PASSWORD;
    const dealerName = process.env.DEALER_NAME || 'Vendor Partner';
    const dealerAgency = process.env.DEALER_AGENCY || 'Wholesale Supplier';
    const dealerPhone = process.env.DEALER_PHONE || '';

    if (dealerPass) {
      let dealerDoc = await Dealer.findOne({
        $or: [{ phone: dealerPhone }, { agencyName: dealerAgency }],
      });
      if (!dealerDoc) {
        dealerDoc = await Dealer.create({
          name: dealerName,
          agencyName: dealerAgency,
          phone: dealerPhone || '9876543210',
          categories: ['general', 'packaged-goods'],
          pendingBalance: 0,
        });
      }

      const dealerUserExists = await User.findOne({ username: dealerUser });
      if (!dealerUserExists) {
        await User.create({
          name: dealerName,
          username: dealerUser,
          password: dealerPass,
          role: 'dealer',
          phone: dealerPhone,
          dealerId: dealerDoc._id,
        });
        logger.info(`Default Dealer account initialized: ${dealerUser}`);
      } else if (!dealerUserExists.dealerId) {
        dealerUserExists.dealerId = dealerDoc._id;
        await dealerUserExists.save();
      }
    }
  } catch (err) {
    logger.warn(`Default accounts setup check: ${err.message}`);
  }
};

export default {
  login,
  getMe,
  registerUser,
  listUsers,
  ensureDefaultAccounts,
};
