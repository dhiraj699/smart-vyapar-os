import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(500, 'JWT_SECRET environment variable is missing in server configuration');
    }
    return 'vyapar_dev_secret_insecure';
  }
  return secret;
};

/**
 * Parses Authorization: Bearer <token> or Cookie and attaches req.user if valid.
 */
export const authenticate = async (req, _res, next) => {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded; // { id, role, name, username, phone, dealerId }
    next();
  } catch (err) {
    req.user = null;
    next();
  }
};

/**
 * Rejects with 401 if user is not authenticated.
 * Exported as both requireAuth and protect.
 */
export const requireAuth = (req, _res, next) => {
  if (!req.user) {
    throw new ApiError(401, 'Authentication required. Please log in.');
  }
  next();
};
export const protect = requireAuth;

/**
 * Rejects with 403 if authenticated user does not have one of the required roles.
 * Exported as both requireRole and authorizeRoles.
 */
export const requireRole = (...allowedRoles) => {
  return (req, _res, next) => {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required. Please log in.');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Access denied: Restricted to ${allowedRoles.join('/')} only (Current role: ${req.user.role})`
      );
    }
    next();
  };
};
export const authorizeRoles = requireRole;

/**
 * Masks sensitive wholesale prices, margins, and dealer info for staff, dealers, or unauthenticated users.
 */
export const maskProductForRole = (product, role) => {
  if (!product) return product;
  const isOwner = role === 'admin';
  if (isOwner) return product;

  // Mask sensitive financial fields for staff or external vendors
  const clone = typeof product.toObject === 'function' ? product.toObject() : { ...product };
  delete clone.wholesalePrice;
  delete clone.marginPerUnit;
  delete clone.dealers;

  clone.isWholesaleHidden = true;
  return clone;
};

export default {
  authenticate,
  requireAuth,
  protect,
  requireRole,
  authorizeRoles,
  maskProductForRole,
};
