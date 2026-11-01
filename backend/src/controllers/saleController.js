import mongoose from 'mongoose';
import { z } from 'zod';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Counter from '../models/Counter.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { normalizePhone, isValidPhone } from '../utils/phone.js';
import { addDays, istDateStamp, round2, round3 } from '../utils/mathHelpers.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const phone = z
  .string()
  .transform(normalizePhone)
  .refine(isValidPhone, 'Phone must be a valid 10-digit Indian mobile number');

export const createBillSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        phone: phone.optional(),
        customerId: objectId.optional(),
      })
      .optional(),
    items: z
      .array(
        z.object({
          productId: objectId,
          quantity: z.number({ invalid_type_error: 'Quantity must be a number' }).positive('Quantity must be positive').max(100000),
        })
      )
      .min(1, 'Add at least one item')
      .max(200, 'Too many line items'),
    discount: z.number().min(0).default(0),
    paymentMode: z.enum(['Cash', 'UPI', 'Udhar', 'Split']),
    udharDueDate: z.coerce.date().optional(),
    splitBreakdown: z
      .object({
        cash: z.number().min(0).default(0),
        upi: z.number().min(0).default(0),
        udhar: z.number().min(0).default(0),
      })
      .optional(),
    offlineRef: z.string().trim().max(100).optional(),
  })
  .superRefine((d, ctx) => {
    const hasCustomer = Boolean(d.customer?.phone || d.customer?.customerId);
    if (d.paymentMode === 'Udhar' && !hasCustomer) {
      ctx.addIssue({ code: 'custom', path: ['customer'], message: 'Customer phone is required for Udhar sales' });
    }
    if (d.paymentMode === 'Split') {
      if (!d.splitBreakdown) ctx.addIssue({ code: 'custom', path: ['splitBreakdown'], message: 'splitBreakdown is required for Split payments' });
      else if (d.splitBreakdown.udhar > 0 && !hasCustomer) {
        ctx.addIssue({ code: 'custom', path: ['customer'], message: 'Customer is required when part of a Split is Udhar' });
      }
    }
    if (d.udharDueDate && d.udharDueDate.getTime() < Date.now() - 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['udharDueDate'], message: 'Udhar due date cannot be in the past' });
    }
  });

/** Everything inside this function runs inside ONE MongoDB transaction (or standalone fallback). */
const persistBill = async (payload, session = null, user = null) => {
  /* 1. Merge duplicate lines and lock rows in a stable order (prevents deadlocks between concurrent bills). */
  const wanted = new Map();
  for (const line of payload.items) {
    wanted.set(line.productId, round3((wanted.get(line.productId) || 0) + line.quantity));
  }
  const lines = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b));

  /* 2. Guarded atomic deductions: $inc only if stockQuantity >= quantity; also refreshes lastSoldAt. */
  const items = [];
  for (const [productId, quantity] of lines) {
    const product = await Product.deductStock(productId, quantity, session);
    if (!product) {
      const q = Product.findById(productId).select('name stockQuantity unit');
      if (session) q.session(session);
      const existing = await q.lean();
      if (!existing) throw new ApiError(404, `Product ${productId} not found`);
      throw new ApiError(409, `Insufficient stock for "${existing.name}": requested ${quantity}, available ${existing.stockQuantity} ${existing.unit}`, [
        { path: 'items', productId, requested: quantity, available: existing.stockQuantity },
      ]);
    }
    if (['pcs', 'packet'].includes(product.unit) && !Number.isInteger(quantity)) {
      throw new ApiError(400, `"${product.name}" is sold in whole ${product.unit}; got ${quantity}`);
    }
    // Server-side pricing: the client can never dictate the unit price.
    items.push({
      product: product._id,
      name: product.name,
      quantity,
      unitPrice: product.sellingPrice,
      total: round2(quantity * product.sellingPrice),
    });
  }

  /* 3. Totals and payment split (also re-validated by the Sale pre-validate hook). */
  const subTotal = round2(items.reduce((s, i) => s + i.total, 0));
  if (payload.discount > subTotal) throw new ApiError(400, `Discount (${payload.discount}) cannot exceed subtotal (${subTotal})`);
  const grandTotal = round2(subTotal - payload.discount);

  let udharAmount = 0;
  if (payload.paymentMode === 'Udhar') udharAmount = grandTotal;
  if (payload.paymentMode === 'Split') {
    const s = payload.splitBreakdown;
    if (round2(s.cash + s.upi + s.udhar) !== grandTotal) {
      throw new ApiError(400, `Split amounts must add up to the grand total (${grandTotal})`);
    }
    udharAmount = s.udhar;
  }

  /* 4. Invoice number INV-YYYYMMDD-XXXX from an atomic per-day counter (rolled back with the transaction). */
  const stamp = istDateStamp();
  const seq = await Counter.next(`INV-${stamp}`, session);
  const billNumber = `INV-${stamp}-${String(seq).padStart(4, '0')}`;
  const saleId = new mongoose.Types.ObjectId();

  /* 5. Customer linkage + udhar posting (same transaction). */
  let customerDoc = null;
  const cust = payload.customer || {};
  if (cust.customerId) {
    const q = Customer.findById(cust.customerId);
    if (session) q.session(session);
    customerDoc = await q;
    if (!customerDoc) throw new ApiError(404, 'Customer not found');
  } else if (cust.phone) {
    if (udharAmount > 0) {
      customerDoc = await Customer.findOneAndUpdate(
        { phone: cust.phone },
        { $setOnInsert: { phone: cust.phone, name: cust.name || `Customer ${cust.phone.slice(-4)}` } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
      );
    } else {
      const q = Customer.findOne({ phone: cust.phone });
      if (session) q.session(session);
      customerDoc = await q;
    }
  }

  let updatedCustomer = customerDoc;
  let dueDate;
  if (udharAmount > 0) {
    dueDate = payload.udharDueDate || addDays(new Date(), 30);
    updatedCustomer = await Customer.findOneAndUpdate(
      {
        _id: customerDoc._id,
        trustScore: { $gte: 3 }, // 1-2 star customers are RESTRICTED
        $expr: { $lte: [{ $add: ['$totalUdhar', udharAmount] }, '$maxCreditLimit'] },
      },
      {
        $inc: { totalUdhar: udharAmount },
        $push: { paymentHistory: { billId: saleId, amount: udharAmount, dueDate, wasDelayed: false } },
      },
      { new: true, runValidators: true, session }
    );
    if (!updatedCustomer) {
      const q = Customer.findById(customerDoc._id);
      if (session) q.session(session);
      const latest = (await q) || customerDoc;

      if (latest.trustScore < 3) {
        throw new ApiError(403, `Customer ${latest.name} is RESTRICTED for credit (trust score ${latest.trustScore})`);
      }
      const available = Math.max(0, round2(latest.maxCreditLimit - latest.totalUdhar));
      throw new ApiError(422, `Credit limit exceeded: bill needs Rs ${udharAmount} but only Rs ${available} credit is available`, [
        { path: 'paymentMode', availableCredit: available, required: udharAmount },
      ]);
    }
  }

  /* 6. Persist the invoice. */
  const createOpts = session ? { session } : undefined;
  const [sale] = await Sale.create(
    [
      {
        _id: saleId,
        billNumber,
        customer: {
          name: cust.name || customerDoc?.name || 'Walk-in Customer',
          phone: cust.phone || customerDoc?.phone,
          customerId: customerDoc?._id,
        },
        items,
        subTotal,
        discount: payload.discount,
        grandTotal,
        paymentMode: payload.paymentMode,
        splitBreakdown: payload.splitBreakdown,
        udharDueDate: dueDate,
        cashier: user
          ? {
              id: user.id || user._id,
              name: user.name || 'Staff',
              role: user.role || 'staff',
            }
          : undefined,
        offlineRef: payload.offlineRef,
      },
    ],
    createOpts
  );

  return { sale, customer: updatedCustomer };
};

/**
 * POST /api/sales/create-bill
 * Atomic checkout: stock deduction + lastSoldAt + invoice + udhar posting commit together or not at all.
 */
export const createBill = asyncHandler(async (req, res) => {
  const payload = createBillSchema.parse(req.body);

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch {
    // Standalone mongo: proceed without session
  }

  let result;
  if (session) {
    try {
      await session.withTransaction(
        async () => {
          result = await persistBill(payload, session, req.user);
        },
        { readConcern: { level: 'majority' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 15000 }
      );
    } catch (err) {
      if (err?.message?.includes('Transaction numbers are only allowed on a replica set member')) {
        logger.warn('MongoDB running in standalone mode (no replica set); executing bill without transaction');
        result = await persistBill(payload, null, req.user);
      } else {
        logger.warn(`Bill transaction rolled back: ${err.message}`);
        throw err;
      }
    } finally {
      await session.endSession();
    }
  } else {
    result = await persistBill(payload, null, req.user);
  }

  const { sale, customer } = result;
  logger.info(`Bill ${sale.billNumber} committed (${sale.items.length} lines, Rs ${sale.grandTotal}, ${sale.paymentMode})`);

  res.status(201).json({
    success: true,
    message: `Bill ${sale.billNumber} created`,
    data: {
      sale,
      customer: customer
        ? {
            _id: customer._id,
            name: customer.name,
            phone: customer.phone,
            totalUdhar: customer.totalUdhar,
            maxCreditLimit: customer.maxCreditLimit,
            trustScore: customer.trustScore,
          }
        : null,
    },
  });
});

export default { createBill, createBillSchema };
