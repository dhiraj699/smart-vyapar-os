import { z } from 'zod';
import PriceAlert from '../models/PriceAlert.js';
import asyncHandler from '../utils/asyncHandler.js';

const createAlertSchema = z.object({
  productName: z.string().trim().min(1).max(150),
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  category: z.string().trim().max(60).optional(),
  currentPrice: z.number().min(0),
  projectedPrice: z.number().min(0),
  direction: z.enum(['INCREASE', 'DECREASE']),
  effectiveDate: z.coerce.date(),
  confidenceScore: z.number().min(0).max(100),
  reason: z.string().trim().max(300).optional(),
  reasonTags: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
  estimatedOrderQty: z.number().min(1).optional(),
});

const listSchema = z.object({
  direction: z.enum(['INCREASE', 'DECREASE']).optional(),
  upcoming: z.enum(['true', 'false']).default('true'),
});

export const listPriceAlerts = asyncHandler(async (req, res) => {
  const { direction, upcoming } = listSchema.parse(req.query);
  const filter = {};
  if (direction) filter.direction = direction;
  if (upcoming === 'true') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    filter.effectiveDate = { $gte: startOfToday };
  }
  const alerts = await PriceAlert.find(filter).sort({ effectiveDate: 1 }).lean();
  res.json({ success: true, count: alerts.length, data: alerts });
});

export const createPriceAlert = asyncHandler(async (req, res) => {
  const alert = await PriceAlert.create(createAlertSchema.parse(req.body));
  res.status(201).json({ success: true, message: 'Price alert created', data: alert });
});
