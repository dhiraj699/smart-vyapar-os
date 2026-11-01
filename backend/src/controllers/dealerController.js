import { z } from 'zod';
import Dealer from '../models/Dealer.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { isValidPhone, normalizePhone } from '../utils/phone.js';

const createDealerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  agencyName: z.string().trim().max(150).optional(),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Phone must be a valid 10-digit Indian mobile number'),
  categories: z.array(z.string().trim().min(1).max(60)).default([]),
  pendingBalance: z.number().default(0),
});

export const listDealers = asyncHandler(async (_req, res) => {
  const dealers = await Dealer.find().sort({ name: 1 }).lean();
  res.json({ success: true, count: dealers.length, data: dealers });
});

export const createDealer = asyncHandler(async (req, res) => {
  const dealer = await Dealer.create(createDealerSchema.parse(req.body));
  res.status(201).json({ success: true, message: 'Dealer created', data: dealer });
});

/**
 * Vendor Portal endpoint: Returns supplier's profile, linked product quotes,
 * restocking demand, and pending ledger balance.
 */
export const getMyVendorPortal = asyncHandler(async (req, res) => {
  let dealerId = req.user?.dealerId;
  if (!dealerId && req.user?.role === 'admin') {
    // If admin is inspecting vendor view, grab first dealer
    const first = await Dealer.findOne();
    dealerId = first?._id;
  }

  if (!dealerId) {
    throw new ApiError(404, 'No supplier/vendor account linked to this user');
  }

  const dealer = await Dealer.findById(dealerId).lean();
  if (!dealer) {
    throw new ApiError(404, 'Dealer record not found');
  }

  const products = await Product.find({ 'dealers.dealerId': dealer._id })
    .select('name barcode category unit sellingPrice stockQuantity lowStockThreshold dealers')
    .lean();

  const linkedProducts = products.map((p) => {
    const quote = p.dealers?.find((d) => String(d.dealerId) === String(dealer._id));
    return {
      _id: p._id,
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      unit: p.unit,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      quotedPrice: quote?.quotedPrice || 0,
      schemeText: quote?.schemeText || '',
      needsRestock: (p.stockQuantity || 0) <= (p.lowStockThreshold || 10),
    };
  });

  res.json({
    success: true,
    data: {
      dealer,
      linkedProducts,
      reorderDemandCount: linkedProducts.filter((p) => p.needsRestock).length,
    },
  });
});

export default {
  listDealers,
  createDealer,
  getMyVendorPortal,
};
