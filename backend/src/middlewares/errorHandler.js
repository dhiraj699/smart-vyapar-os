import mongoose from 'mongoose';
import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

export const notFound = (req, _res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

/** Central error translator: every failure leaves the API as { success:false, message, errors? }. */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    return _next(err);
  }

  const safeErr = err && typeof err === 'object' ? err : { message: String(err) };
  let status = safeErr.statusCode || safeErr.status || 500;
  let message = safeErr.message || 'Internal server error';
  let errors;

  if (safeErr instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    errors = safeErr.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (safeErr instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(safeErr.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (safeErr instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for "${safeErr.path}"`;
    errors = [{ path: safeErr.path, message: `Must be a valid ${safeErr.kind}` }];
  } else if (safeErr.code === 11000) {
    status = 409;
    const fields = Object.keys(safeErr.keyPattern || safeErr.keyValue || {});
    message = `Duplicate value for: ${fields.join(', ') || 'unique field'}`;
    errors = fields.map((f) => ({ path: f, message: 'Already exists' }));
  } else if (safeErr.name === 'MongoServerSelectionError' || safeErr.name === 'MongoNetworkError' || safeErr.name === 'MongooseServerSelectionError') {
    status = 503;
    message = 'Database service unavailable or timed out. Please try again shortly.';
  } else if (safeErr.name === 'MongoTransactionError') {
    status = 409;
    message = 'Transaction conflict occurred. Please retry the operation.';
  } else if (safeErr.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (safeErr.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (safeErr.name === 'JsonWebTokenError' || safeErr.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  } else if (safeErr instanceof ApiError) {
    errors = safeErr.details;
  } else if (/not allowed by CORS/.test(message)) {
    status = 403;
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed [${status}]: ${message}`, safeErr);
    if (process.env.NODE_ENV === 'production') {
      message = 'Internal server error';
      errors = undefined;
    }
  } else {
    logger.warn(`${req.method} ${req.originalUrl} rejected [${status}]: ${message}`);
  }

  const body = { success: false, message };
  if (errors && Array.isArray(errors) && errors.length) body.errors = errors;
  if (process.env.NODE_ENV !== 'production' && status >= 500 && safeErr.stack) body.stack = safeErr.stack;

  res.status(status).json(body);
};

export default errorHandler;
