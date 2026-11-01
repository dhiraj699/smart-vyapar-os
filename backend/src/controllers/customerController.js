import mongoose from 'mongoose';
import { z } from 'zod';
import Customer from '../models/Customer.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { isValidPhone, normalizePhone } from '../utils/phone.js';
import { round2 } from '../utils/mathHelpers.js';

const phoneSchema = z.string().transform(normalizePhone).refine(isValidPhone, 'Phone must be a valid 10-digit Indian mobile number');

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: phoneSchema,
  maxCreditLimit: z.number().min(0).default(2000),
});

const settleSchema = z.object({
  amount: z.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be positive'),
});

const summary = (c) => {
  const totalUdhar = round2(c.totalUdhar || 0);
  const maxCreditLimit = round2(c.maxCreditLimit ?? 2000);
  return {
    _id: c._id,
    name: c.name,
    phone: c.phone,
    totalUdhar,
    maxCreditLimit,
    trustScore: c.trustScore ?? 5,
    availableCredit: Math.max(0, round2(maxCreditLimit - totalUdhar)),
    paymentHistory: c.paymentHistory || [],
  };
};

/** GET /api/customers/by-phone/:phone  (POS udhar lookup) */
export const lookupByPhone = asyncHandler(async (req, res) => {
  const phone = phoneSchema.parse(req.params.phone);
  const customer = await Customer.findOne({ phone }).lean();
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ success: true, data: summary(customer) });
});

/** GET /api/customers (list customers, filterable by hasUdhar) */
export const listCustomers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.hasUdhar === 'true') {
    filter.totalUdhar = { $gt: 0 };
  }
  const customers = await Customer.find(filter).sort({ totalUdhar: -1, name: 1 }).limit(100).lean();
  res.json({ success: true, count: customers.length, data: customers.map(summary) });
});

/** POST /api/customers */
export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create(createSchema.parse(req.body));
  res.status(201).json({ success: true, message: 'Customer created', data: summary(customer) });
});

/**
 * Internal logic for settling udhar. Can run within a session or standalone.
 */
const executeSettle = async (id, amount, session = null) => {
  const query = Customer.findById(id);
  if (session) query.session(session);
  const customer = await query;

  if (!customer) throw new ApiError(404, 'Customer not found');
  if (customer.totalUdhar <= 0) throw new ApiError(400, 'Customer has no outstanding udhar');

  const applied = round2(Math.min(amount, customer.totalUdhar));
  let remaining = applied;
  const now = new Date();

  const open = (customer.paymentHistory || [])
    .filter((e) => !e.clearedDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  for (const entry of open) {
    if (remaining <= 0) break;
    if (remaining >= entry.amount) {
      remaining = round2(remaining - entry.amount);
      entry.clearedDate = now;
      entry.wasDelayed = entry.dueDate ? new Date(now) > new Date(entry.dueDate) : false;
    } else {
      entry.amount = round2(entry.amount - remaining);
      remaining = 0;
    }
  }

  // Save updated payment history
  if (session) {
    await customer.save({ session });
  } else {
    await customer.save();
  }

  // Atomically decrement totalUdhar with $gte guard against negative balances and race conditions
  const updateQuery = Customer.findOneAndUpdate(
    { _id: id, totalUdhar: { $gte: applied } },
    { $inc: { totalUdhar: -applied } },
    { new: true, runValidators: true, session }
  );
  const updated = await updateQuery;

  if (!updated) {
    throw new ApiError(409, 'Conflict: Customer udhar balance changed concurrently. Please refresh and retry.');
  }

  return { applied, customer: updated };
};

/**
 * POST /api/customers/:id/settle
 * Records an udhar repayment: oldest bills are cleared first; a part-payment reduces the oldest open bill's outstanding amount.
 * Guarded atomic $inc check protects against negative balances under concurrency.
 */
export const settleUdhar = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') }).parse(req.params);
  const { amount } = settleSchema.parse(req.body);

  let result;
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch {
    // Standalone mongo: proceed without session
  }

  if (session) {
    try {
      await session.withTransaction(
        async () => {
          result = await executeSettle(id, amount, session);
        },
        { readConcern: { level: 'majority' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 15000 }
      );
    } catch (err) {
      if (err?.message?.includes('Transaction numbers are only allowed on a replica set member')) {
        logger.warn('MongoDB running in standalone mode (no replica set); settling udhar without transaction');
        result = await executeSettle(id, amount, null);
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }
  } else {
    result = await executeSettle(id, amount, null);
  }

  logger.info(`Udhar settled: ${result.customer.phone} paid Rs ${result.applied}, remaining balance Rs ${result.customer.totalUdhar}`);
  res.json({ success: true, message: `Recorded payment of Rs ${result.applied}`, data: summary(result.customer) });
});

export default {
  lookupByPhone,
  listCustomers,
  createCustomer,
  settleUdhar,
};
