/** Pure helper math used by billing, procurement and risk algorithms. */

export const round2 = (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
};

export const round3 = (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
};

export const round4 = (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
};

export const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);
export const mean = (arr) => (arr?.length ? arr.reduce((a, b) => a + (Number(b) || 0), 0) / arr.length : 0);
export const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MS_PER_DAY = 86_400_000;
export const daysBetween = (from, to) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY);
export const addDays = (date, days) => new Date(new Date(date).getTime() + days * MS_PER_DAY);

/** yyyymmdd in Indian Standard Time (UTC+5:30), independent of the server timezone. */
export const istDateStamp = (date = new Date()) => {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10).replace(/-/g, '');
};

/* ------------------------------------------------------------------ */
/* Dealer scheme maths                                                 */
/* ------------------------------------------------------------------ */

const SCHEME_PATTERNS = [
  { re: /(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)/, base: 1, free: 2 }, // 10+1
  { re: /buy\s*(\d+(?:\.\d+)?)\s*get\s*(\d+(?:\.\d+)?)/i, base: 1, free: 2 }, // buy 10 get 1 free
  { re: /(\d+(?:\.\d+)?)\s*(?:pe|par|per|on)\s*(\d+(?:\.\d+)?)\s*free/i, base: 1, free: 2 }, // 10 pe 1 free
  { re: /(\d+(?:\.\d+)?)\s*free\s*(?:on|per|with|pe|par)\s*(\d+(?:\.\d+)?)/i, base: 2, free: 1 }, // 1 free on 10
];

/** Parse "10+1", "Buy 12 get 1 free", "10 pe 1 free" ... -> { baseQuantity, freeUnits } */
export const parseSchemeText = (text) => {
  if (!text || typeof text !== 'string') return null;
  for (const { re, base, free } of SCHEME_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const baseQuantity = Number(m[base]);
      const freeUnits = Number(m[free]);
      if (baseQuantity > 0 && freeUnits >= 0) return { baseQuantity, freeUnits };
    }
  }
  return null;
};

/** Explicit numeric fields win; otherwise infer from schemeText; otherwise no scheme. */
export const resolveScheme = (quote) => {
  if (quote?.baseQuantity > 0 && quote?.freeUnits >= 0) {
    return { baseQuantity: Number(quote.baseQuantity), freeUnits: Number(quote.freeUnits) };
  }
  return parseSchemeText(quote?.schemeText) || { baseQuantity: 1, freeUnits: 0 };
};

/** EffectivePrice = (quotedPrice * baseQuantity) / (baseQuantity + freeUnits) */
export const effectivePrice = (quotedPrice, baseQuantity, freeUnits) => {
  const price = Number(quotedPrice) || 0;
  const base = Number(baseQuantity) || 0;
  const free = Number(freeUnits) || 0;
  const lot = base + free;
  if (lot <= 0) return round4(price);
  return round4((price * base) / lot);
};

/**
 * Lot-aware cost: free units are only granted on complete lots of (base + free) units.
 * To receive `requiredQty` units you pay for requiredQty - fullLots * free units.
 */
export const schemeCost = (requiredQty, quotedPrice, baseQuantity, freeUnits) => {
  const qty = Math.max(0, Number(requiredQty) || 0);
  const price = Math.max(0, Number(quotedPrice) || 0);
  const base = Math.max(0, Number(baseQuantity) || 0);
  const free = Math.max(0, Number(freeUnits) || 0);
  const lotSize = base + free;

  if (lotSize <= 0 || free <= 0) {
    return { fullLots: 0, freeReceived: 0, payableUnits: qty, cost: round2(qty * price) };
  }

  const fullLots = Math.floor(qty / lotSize);
  const freeReceived = fullLots * free;
  const payableUnits = Math.max(0, qty - freeReceived);
  return { fullLots, freeReceived, payableUnits, cost: round2(payableUnits * price) };
};

/* ------------------------------------------------------------------ */
/* Customer udhar risk engine                                          */
/* ------------------------------------------------------------------ */

export const RISK_WEIGHTS = { w1: 0.5, w2: 0.3, w3: 0.4 };
export const RISK_CONFIG = { maxDelayDays: 45, maxDefaultsForPenalty: 3, defaultAfterDays: 45 };

/**
 * Score = w1*RepaymentSpeedRatio + w2*AvgDelayDaysNormalized - w3*DefaultPenalty
 *  - RepaymentSpeedRatio     : share of due bills cleared on/before the due date             (0..1, higher better)
 *  - AvgDelayDaysNormalized  : 1 - min(avgDelayDays / 45, 1)                                 (0..1, higher better)
 *  - DefaultPenalty          : min(defaultCount / 3, 1), default = unpaid and > 45 days late (0..1, lower better)
 * The raw score lives in [-w3, w1 + w2]; it is min-max normalised onto 1.0 .. 5.0 stars.
 */
export const computeRiskScore = (paymentHistory = [], now = new Date()) => {
  const { w1, w2, w3 } = RISK_WEIGHTS;
  const history = Array.isArray(paymentHistory) ? paymentHistory : [];
  const settled = history.filter((e) => e && e.clearedDate);
  const open = history.filter((e) => e && !e.clearedDate);
  const openOverdue = open.filter((e) => e.dueDate && new Date(e.dueDate) < now);
  const considered = settled.length + openOverdue.length;

  const outstandingEntries = open.length;
  const maxOverdueDays = openOverdue.reduce((mx, e) => Math.max(mx, daysBetween(e.dueDate, now)), 0);

  if (considered === 0) {
    return {
      hasHistory: false,
      stars: null,
      components: null,
      stats: { settled: 0, openOverdue: 0, outstandingEntries, maxOverdueDays: 0, defaultCount: 0, avgDelayDays: 0 },
    };
  }

  const onTime = settled.filter((e) => !e.dueDate || new Date(e.clearedDate) <= new Date(e.dueDate)).length;
  const repaymentSpeedRatio = onTime / considered;

  const delays = [
    ...settled.map((e) => (e.dueDate ? Math.max(0, daysBetween(e.dueDate, e.clearedDate)) : 0)),
    ...openOverdue.map((e) => daysBetween(e.dueDate, now)),
  ];
  const avgDelayDays = mean(delays);
  const avgDelayNormalized = 1 - clamp(avgDelayDays / RISK_CONFIG.maxDelayDays, 0, 1);

  const defaultCount = openOverdue.filter((e) => daysBetween(e.dueDate, now) > RISK_CONFIG.defaultAfterDays).length;
  const defaultPenalty = clamp(defaultCount / RISK_CONFIG.maxDefaultsForPenalty, 0, 1);

  const raw = w1 * repaymentSpeedRatio + w2 * avgDelayNormalized - w3 * defaultPenalty;
  const minRaw = -w3;
  const maxRaw = w1 + w2;
  const stars = Math.round((1 + 4 * ((raw - minRaw) / (maxRaw - minRaw))) * 10) / 10;

  return {
    hasHistory: true,
    stars: clamp(stars, 1, 5),
    components: {
      repaymentSpeedRatio: round4(repaymentSpeedRatio),
      avgDelayDaysNormalized: round4(avgDelayNormalized),
      defaultPenalty: round4(defaultPenalty),
      rawScore: round4(raw),
      weights: RISK_WEIGHTS,
    },
    stats: {
      settled: settled.length,
      openOverdue: openOverdue.length,
      outstandingEntries,
      maxOverdueDays,
      defaultCount,
      avgDelayDays: round2(avgDelayDays),
    },
  };
};

/** UPI intent deep link: upi://pay?pa=shop@upi&am=AMOUNT&pn=ShopName */
export const buildUpiLink = ({ pa = 'shop@upi', pn = 'ShopName', am, tn } = {}) => {
  const parts = [`pa=${encodeURIComponent(pa || 'shop@upi')}`, `pn=${encodeURIComponent(pn || 'ShopName')}`];
  if (am !== undefined && am !== null) {
    const val = Number(am);
    if (Number.isFinite(val) && val > 0) {
      parts.push(`am=${val.toFixed(2)}`);
    }
  }
  parts.push('cu=INR');
  if (tn) parts.push(`tn=${encodeURIComponent(String(tn))}`);
  return `upi://pay?${parts.join('&')}`;
};

export default {
  round2,
  round3,
  round4,
  clamp,
  mean,
  escapeRegex,
  daysBetween,
  addDays,
  istDateStamp,
  parseSchemeText,
  resolveScheme,
  effectivePrice,
  schemeCost,
  computeRiskScore,
  buildUpiLink,
};
