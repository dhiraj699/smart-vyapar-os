import { z } from 'zod';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { isValidPhone, normalizePhone } from '../utils/phone.js';
import {
  buildUpiLink,
  computeRiskScore,
  effectivePrice,
  resolveScheme,
  round2,
  round3,
  schemeCost,
} from '../utils/mathHelpers.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const MS_PER_DAY = 86_400_000;

/* ================================================================== */
/* 1. DEAD CAPITAL LIQUIDATOR ENGINE                                   */
/* ================================================================== */

const COMPLEMENTS = {
  rice: ['dal', 'oil', 'spices'],
  atta: ['oil', 'dal', 'spices'],
  dal: ['rice', 'spices', 'oil'],
  oil: ['atta', 'rice', 'spices'],
  spices: ['rice', 'dal', 'atta'],
  tea: ['sugar', 'biscuits', 'snacks'],
  sugar: ['tea', 'milk'],
  biscuits: ['tea', 'beverages'],
  snacks: ['beverages', 'namkeen'],
  namkeen: ['beverages', 'tea'],
  beverages: ['snacks', 'biscuits'],
  noodles: ['sauces', 'beverages'],
  toiletries: ['soap', 'cleaning'],
  soap: ['toiletries', 'cleaning'],
  cleaning: ['soap', 'toiletries'],
  dairy: ['bakery', 'tea'],
  bakery: ['dairy', 'tea'],
};

const deadCapitalQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(Number(process.env.DEAD_STOCK_DAYS) || 45),
  factor: z.coerce.number().min(0).max(1).default(0.4), // share of the dead item's margin given away as bundle discount
  limit: z.coerce.number().int().min(1).max(500).default(100),
  sync: z.enum(['true', 'false']).default('false'), // true => persist isDeadStock flags
});

const catKey = (p) => String(p.category || '').trim().toLowerCase();

/** Fast movers = best sellers of the last 30 days (Sale aggregation), falling back to "sold within a week". */
const loadFastMovers = async (cutoff, excludeIds) => {
  const since = new Date(Date.now() - 30 * MS_PER_DAY);
  const velocity = await Sale.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', unitsSold30d: { $sum: '$items.quantity' }, revenue30d: { $sum: '$items.total' } } },
    { $sort: { unitsSold30d: -1 } },
    { $limit: 150 },
  ]);
  const velocityById = new Map(velocity.map((v) => [String(v._id), v]));

  const projection = 'name category unit sellingPrice wholesalePrice stockQuantity lastSoldAt';
  const fromSales = velocity.length
    ? await Product.find({ _id: { $in: velocity.map((v) => v._id), $nin: excludeIds }, stockQuantity: { $gt: 0 }, lastSoldAt: { $gte: cutoff } })
        .select(projection)
        .lean()
    : [];

  let movers = fromSales.map((p) => ({ ...p, unitsSold30d: round3(velocityById.get(String(p._id))?.unitsSold30d || 0) }));

  if (movers.length < 10) {
    const recent = await Product.find({
      _id: { $nin: [...excludeIds, ...movers.map((m) => m._id)] },
      stockQuantity: { $gt: 0 },
      lastSoldAt: { $gte: new Date(Date.now() - 7 * MS_PER_DAY) },
    })
      .select(projection)
      .sort({ lastSoldAt: -1 })
      .limit(50)
      .lean();
    movers = movers.concat(recent.map((p) => ({ ...p, unitsSold30d: 0 })));
  }
  return movers.sort((a, b) => b.unitsSold30d - a.unitsSold30d);
};

const pickPartner = (dead, movers, usage) => {
  const dCat = catKey(dead);
  const complements = COMPLEMENTS[dCat] || [];
  const tiers = [
    ['SAME_CATEGORY', movers.filter((m) => catKey(m) === dCat)],
    ['COMPLEMENTARY', movers.filter((m) => complements.includes(catKey(m)))],
    ['GENERAL', movers],
  ];
  for (const [matchType, pool] of tiers) {
    if (!pool.length) continue;
    // Spread dead items across different partners: least-used first, then fastest-moving.
    const best = [...pool].sort((a, b) => (usage.get(String(a._id)) || 0) - (usage.get(String(b._id)) || 0) || b.unitsSold30d - a.unitsSold30d)[0];
    usage.set(String(best._id), (usage.get(String(best._id)) || 0) + 1);
    return { partner: best, matchType };
  }
  return null;
};

/** GET /api/analytics/dead-capital */
export const getDeadCapital = asyncHandler(async (req, res) => {
  const { days, factor, limit, sync } = deadCapitalQuery.parse(req.query);
  const cutoff = new Date(Date.now() - days * MS_PER_DAY);

  const [agg] = await Product.aggregate([
    {
      $match: {
        stockQuantity: { $gt: 0 },
        $or: [{ lastSoldAt: { $lt: cutoff } }, { lastSoldAt: null }, { lastSoldAt: { $exists: false } }],
      },
    },
    {
      $addFields: {
        blockedCapital: { $multiply: ['$wholesalePrice', '$stockQuantity'] },
        marginPerUnit: { $subtract: ['$sellingPrice', '$wholesalePrice'] },
        daysIdle: {
          $cond: {
            if: { $and: ['$lastSoldAt', { $ne: ['$lastSoldAt', null] }] },
            then: { $floor: { $divide: [{ $subtract: ['$$NOW', '$lastSoldAt'] }, MS_PER_DAY] } },
            else: days,
          },
        },
      },
    },
    {
      $facet: {
        items: [
          { $sort: { blockedCapital: -1 } },
          { $limit: limit },
          { $project: { dealers: 0, __v: 0 } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              totalBlockedCapital: { $sum: '$blockedCapital' },
              deadProductCount: { $sum: 1 },
              totalUnits: { $sum: '$stockQuantity' },
              potentialRevenue: { $sum: { $multiply: ['$sellingPrice', '$stockQuantity'] } },
            },
          },
        ],
        byCategory: [
          { $group: { _id: '$category', blockedCapital: { $sum: '$blockedCapital' }, products: { $sum: 1 } } },
          { $sort: { blockedCapital: -1 } },
          { $project: { _id: 0, category: '$_id', blockedCapital: { $round: ['$blockedCapital', 2] }, products: 1 } },
        ],
      },
    },
  ]);

  const deadItems = agg?.items || [];
  const totals = agg?.totals?.[0] || { totalBlockedCapital: 0, deadProductCount: 0, totalUnits: 0, potentialRevenue: 0 };

  const movers = deadItems.length ? await loadFastMovers(cutoff, deadItems.map((d) => d._id)) : [];
  const usage = new Map();

  const items = deadItems.map((dead) => {
    const base = {
      productId: dead._id,
      name: dead.name,
      category: dead.category,
      unit: dead.unit,
      stockQuantity: dead.stockQuantity,
      wholesalePrice: dead.wholesalePrice,
      sellingPrice: dead.sellingPrice,
      lastSoldAt: dead.lastSoldAt,
      daysIdle: dead.daysIdle,
      blockedCapital: round2(dead.blockedCapital),
    };

    const match = pickPartner(dead, movers, usage);
    if (!match) {
      return { ...base, recommendation: { strategy: 'CLEARANCE', message: 'No fast-moving item available to bundle with. Run a flat clearance discount instead.' } };
    }

    const { partner, matchType } = match;
    const margin = round2(dead.marginPerUnit);
    // Bundle discount formula: DeadStockMargin * factor (default 0.4). Never discount a zero/negative-margin item.
    const discountPerBundle = margin > 0 ? round2(margin * factor) : 0;
    const normalPrice = round2(dead.sellingPrice + partner.sellingPrice);
    const bundlePrice = round2(normalPrice - discountPerBundle);
    const dailyDemand = partner.unitsSold30d / 30;
    const suggestedBundles = Math.max(1, Math.min(Math.floor(dead.stockQuantity), Math.ceil(dailyDemand * 14) || Math.ceil(dead.stockQuantity * 0.25)));

    return {
      ...base,
      recommendation: {
        strategy: 'BUNDLE',
        matchType,
        fastMover: {
          productId: partner._id,
          name: partner.name,
          category: partner.category,
          sellingPrice: partner.sellingPrice,
          unitsSold30d: partner.unitsSold30d,
        },
        deadStockMarginPerUnit: margin,
        discountFormula: `margin(${margin}) x ${factor}`,
        discountPerBundle,
        normalPrice,
        bundlePrice,
        discountPercent: normalPrice > 0 ? round2((discountPerBundle / normalPrice) * 100) : 0,
        suggestedBundles,
        capitalFreedIfSold: round2(suggestedBundles * dead.wholesalePrice),
        message: `Sell 1 ${dead.name} + 1 ${partner.name} for Rs ${bundlePrice} (save Rs ${discountPerBundle})`,
      },
    };
  });

  let syncResult;
  if (sync === 'true') {
    syncResult = await Product.syncDeadStockFlags(cutoff);
    logger.info(`Dead-stock flags synced: ${JSON.stringify(syncResult)}`);
  }

  logger.info(`Dead capital: Rs ${round2(totals.totalBlockedCapital)} blocked in ${totals.deadProductCount} products (> ${days} days idle)`);

  res.json({
    success: true,
    data: {
      thresholdDays: days,
      cutoffDate: cutoff,
      bundleDiscountFactor: factor,
      summary: {
        totalBlockedCapital: round2(totals.totalBlockedCapital),
        deadProductCount: totals.deadProductCount,
        totalUnits: round3(totals.totalUnits),
        potentialRevenueAtMrp: round2(totals.potentialRevenue),
      },
      categoryBreakdown: agg?.byCategory || [],
      items,
      ...(syncResult ? { sync: syncResult } : {}),
    },
  });
});

/* ================================================================== */
/* 2. MULTI-DEALER SPLIT-ORDER OPTIMIZER                               */
/* ================================================================== */

const optimizeSchema = z.object({
  items: z
    .array(z.object({ productId: objectId, requiredQuantity: z.number().positive('requiredQuantity must be positive') }))
    .min(1, 'Provide at least one item')
    .max(200),
});

/** POST /api/procurement/optimize-order */
export const optimizeOrder = asyncHandler(async (req, res) => {
  const { items } = optimizeSchema.parse(req.body);

  const required = new Map();
  for (const it of items) required.set(it.productId, round3((required.get(it.productId) || 0) + it.requiredQuantity));
  const ids = [...required.keys()];

  const products = await Product.find({ _id: { $in: ids } })
    .populate('dealers.dealerId', 'name agencyName phone pendingBalance')
    .lean();

  const found = new Set(products.map((p) => String(p._id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new ApiError(404, `Products not found: ${missing.join(', ')}`);

  const orders = new Map(); // dealerId -> purchase order
  const unassigned = [];

  for (const product of products) {
    const qty = required.get(String(product._id));

    const options = (product.dealers || [])
      .filter((q) => q.dealerId && q.dealerId._id)
      .map((q) => {
        const { baseQuantity, freeUnits } = resolveScheme(q);
        const eff = effectivePrice(q.quotedPrice, baseQuantity, freeUnits); // (quoted * base) / (base + free)
        const lot = schemeCost(qty, q.quotedPrice, baseQuantity, freeUnits);
        return { quote: q, dealer: q.dealerId, baseQuantity, freeUnits, effectivePrice: eff, ...lot };
      });

    if (!options.length) {
      unassigned.push({ productId: product._id, name: product.name, requiredQuantity: qty, reason: 'No dealer has quoted a price for this product' });
      continue;
    }

    // Cheapest actual cost wins; ties go to lower effective price, then to the dealer we owe less.
    options.sort(
      (a, b) =>
        (Number(a.cost) || 0) - (Number(b.cost) || 0) ||
        (Number(a.effectivePrice) || 0) - (Number(b.effectivePrice) || 0) ||
        (Number(a.dealer?.pendingBalance) || 0) - (Number(b.dealer?.pendingBalance) || 0)
    );
    const best = options[0];
    const worst = options[options.length - 1];

    const baselineCost = product.wholesalePrice > 0 ? round2(product.wholesalePrice * qty) : worst.cost;
    const savings = round2(baselineCost - best.cost);
    const savingsVsWorstQuote = round2(worst.cost - best.cost);

    const dealerKey = String(best.dealer._id);
    if (!orders.has(dealerKey)) {
      orders.set(dealerKey, {
        dealer: {
          dealerId: best.dealer._id,
          name: best.dealer.name,
          agencyName: best.dealer.agencyName,
          phone: best.dealer.phone,
          pendingBalance: best.dealer.pendingBalance,
        },
        lines: [],
        subtotal: 0,
        baselineCost: 0,
        netSavings: 0,
      });
    }
    const order = orders.get(dealerKey);
    order.lines.push({
      productId: product._id,
      name: product.name,
      unit: product.unit,
      requiredQuantity: qty,
      payableUnits: round3(best.payableUnits),
      freeUnits: round3(best.freeReceived),
      quotedPrice: best.quote.quotedPrice,
      schemeText: best.quote.schemeText || '',
      effectivePrice: best.effectivePrice,
      lineCost: best.cost,
      baselineCost,
      savings,
      savingsVsWorstQuote,
      alternatives: options.slice(1, 4).map((o) => ({
        dealerName: o.dealer.name,
        quotedPrice: o.quote.quotedPrice,
        schemeText: o.quote.schemeText || '',
        effectivePrice: o.effectivePrice,
        cost: o.cost,
        extraCost: round2(o.cost - best.cost),
      })),
    });
    order.subtotal = round2(order.subtotal + best.cost);
    order.baselineCost = round2(order.baselineCost + baselineCost);
    order.netSavings = round2(order.netSavings + savings);
  }

  const purchaseOrders = [...orders.values()].sort((a, b) => b.subtotal - a.subtotal);
  const totalCost = round2(purchaseOrders.reduce((s, o) => s + o.subtotal, 0));
  const totalBaseline = round2(purchaseOrders.reduce((s, o) => s + o.baselineCost, 0));

  logger.info(`Procurement optimised: ${ids.length} products -> ${purchaseOrders.length} dealer order(s), savings Rs ${round2(totalBaseline - totalCost)}`);

  res.json({
    success: true,
    data: {
      purchaseOrders,
      unassigned,
      summary: {
        productsRequested: ids.length,
        dealersInvolved: purchaseOrders.length,
        totalCost,
        baselineCost: totalBaseline,
        totalNetSavings: round2(totalBaseline - totalCost),
        baselineNote: 'Baseline = quantity x current wholesalePrice on record (or the dearest quote when none is set).',
      },
    },
  });
});

/* ================================================================== */
/* 3. CUSTOMER UDHAR RISK SCORE ENGINE                                 */
/* ================================================================== */

const riskSchema = z
  .object({
    customerId: objectId.optional(),
    phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Invalid phone').optional(),
    persist: z.boolean().default(true),
  })
  .refine((d) => d.customerId || d.phone, { message: 'Provide customerId or phone' });

export const riskFlagFor = (stars, maxOverdueDays) => {
  if (maxOverdueDays > 45 || stars < 3) {
    return { code: 'RESTRICTED', label: 'RESTRICTED (Overdue past 45 days)', color: 'red' };
  }
  if (stars < 4) return { code: 'LIMIT_WARNING', label: 'Limit Warning (Max Rs 1500)', color: 'yellow' };
  return { code: 'SAFE', label: 'Safe for Credit', color: 'green' };
};

export const upiLinkFor = (amount, note) =>
  buildUpiLink({ pa: process.env.SHOP_UPI_ID || 'shop@upi', pn: process.env.SHOP_NAME || 'ShopName', am: amount, tn: note });

/** POST /api/customers/calculate-risk */
export const calculateRisk = asyncHandler(async (req, res) => {
  const { customerId, phone, persist } = riskSchema.parse(req.body);
  const customer = await Customer.findOne(customerId ? { _id: customerId } : { phone });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const now = new Date();
  const risk = computeRiskScore(customer.paymentHistory, now);

  // Brand-new customers with no repayment evidence keep their current trust score.
  const stars = risk.hasHistory ? risk.stars : customer.trustScore;
  const flag = riskFlagFor(stars, risk.stats.maxOverdueDays);

  const recommendedCreditLimit =
    flag.code === 'RESTRICTED' ? 0 : flag.code === 'LIMIT_WARNING' ? Math.min(customer.maxCreditLimit, 1500) : customer.maxCreditLimit;

  if (persist && risk.hasHistory && stars !== customer.trustScore) {
    await Customer.updateOne({ _id: customer._id }, { $set: { trustScore: stars } });
    logger.info(`Trust score for ${customer.phone}: ${customer.trustScore} -> ${stars} (${flag.code})`);
  }

  const outstanding = round2(customer.totalUdhar);
  res.json({
    success: true,
    data: {
      customer: { _id: customer._id, name: customer.name, phone: customer.phone },
      trustScore: stars,
      previousTrustScore: customer.trustScore,
      flag,
      hasHistory: risk.hasHistory,
      formula: 'Score = w1*RepaymentSpeedRatio + w2*AvgDelayDaysNormalized - w3*DefaultPenalty, scaled to 1.0-5.0',
      components: risk.components,
      stats: risk.stats,
      credit: {
        totalUdhar: outstanding,
        maxCreditLimit: customer.maxCreditLimit,
        recommendedCreditLimit,
        availableCredit: Math.max(0, round2(recommendedCreditLimit - outstanding)),
      },
      upiLink: outstanding > 0 ? upiLinkFor(outstanding, `Udhar ${customer.name}`) : null,
    },
  });
});

/** GET /api/customers/:id/upi-link?amount=  (defaults to the full outstanding udhar) */
export const getUdharUpiLink = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const { amount } = z.object({ amount: z.coerce.number().positive().optional() }).parse(req.query);

  const customer = await Customer.findById(id).select('name phone totalUdhar').lean();
  if (!customer) throw new ApiError(404, 'Customer not found');

  const payable = round2(amount ?? customer.totalUdhar);
  if (!(payable > 0)) throw new ApiError(400, 'Nothing to collect: customer has no outstanding udhar');

  res.json({
    success: true,
    data: {
      customer: { _id: customer._id, name: customer.name, phone: customer.phone },
      amount: payable,
      upiLink: upiLinkFor(payable, `Udhar ${customer.name}`),
    },
  });
});
