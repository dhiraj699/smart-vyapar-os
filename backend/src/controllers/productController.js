import { z } from 'zod';
import Product, { UNITS } from '../models/Product.js';
import Dealer from '../models/Dealer.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { escapeRegex } from '../utils/mathHelpers.js';
import { maskProductForRole } from '../middlewares/authMiddleware.js';
import { generateStressTestProducts } from '../utils/stressTestData.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150),
    barcode: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    category: z.string().trim().max(60).default('General'),
    unit: z.enum(UNITS),
    wholesalePrice: z.number().min(0, 'Wholesale price cannot be negative'),
    sellingPrice: z.number().min(0, 'Selling price cannot be negative'),
    stockQuantity: z.number().min(0, 'Stock cannot be negative').default(0),
    lowStockThreshold: z.number().min(0).default(10),
    dealers: z
      .array(
        z.object({
          dealerId: objectId,
          quotedPrice: z.number().min(0),
          schemeText: z.string().trim().max(200).optional(),
          baseQuantity: z.number().min(1).optional(),
          freeUnits: z.number().min(0).optional(),
        })
      )
      .default([]),
  })
  .superRefine((d, ctx) => {
    const ids = d.dealers.map((x) => x.dealerId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['dealers'], message: 'Duplicate dealer in quotes' });
    d.dealers.forEach((q, i) => {
      if ((q.baseQuantity === undefined) !== (q.freeUnits === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['dealers', i], message: 'Provide both baseQuantity and freeUnits, or neither' });
      }
    });
  });

const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150).optional(),
  barcode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
  category: z.string().trim().max(60).optional(),
  unit: z.enum(UNITS).optional(),
  wholesalePrice: z.number().min(0, 'Wholesale price cannot be negative').optional(),
  sellingPrice: z.number().min(0, 'Selling price cannot be negative').optional(),
  stockQuantity: z.number().min(0, 'Stock cannot be negative').optional(),
  lowStockThreshold: z.number().min(0).optional(),
});

const restockSchema = z.object({
  addedQuantity: z.number({ invalid_type_error: 'Quantity must be a number' }).positive('Added quantity must be positive'),
  wholesalePrice: z.number().min(0).optional(),
});

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query "q" is required').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const lowStockQuerySchema = z.object({ category: z.string().trim().max(60).optional() });

/** POST /api/products */
export const createProduct = asyncHandler(async (req, res) => {
  const data = createProductSchema.parse(req.body);

  if (data.barcode) {
    const existing = await Product.findOne({ barcode: data.barcode });
    if (existing) {
      throw new ApiError(409, `Barcode "${data.barcode}" is already assigned to "${existing.name}"`);
    }
  }

  if (data.dealers.length) {
    const ids = data.dealers.map((d) => d.dealerId);
    const found = await Dealer.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw new ApiError(400, 'One or more dealerId values do not exist');
  }

  const product = await Product.create({
    ...data,
    isDeadStock: false,
    lastSoldAt: new Date(),
  });
  logger.info(`Product created: ${product.name} (${product._id}) with ${product.dealers.length} dealer quote(s)`);
  res.status(201).json({ success: true, message: 'Product created successfully', data: product });
});

/** PUT /api/products/:id */
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const data = updateProductSchema.parse(req.body);

  if (data.barcode) {
    const existing = await Product.findOne({ barcode: data.barcode, _id: { $ne: id } });
    if (existing) {
      throw new ApiError(409, `Barcode "${data.barcode}" is already assigned to "${existing.name}"`);
    }
  }

  const product = await Product.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  if (!product) throw new ApiError(404, 'Product not found');

  logger.info(`Product updated: ${product.name} (${product._id})`);
  res.json({ success: true, message: 'Product updated successfully', data: product });
});

/** POST /api/products/:id/restock */
export const restockProduct = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const { addedQuantity, wholesalePrice } = restockSchema.parse(req.body);

  const update = {
    $inc: { stockQuantity: addedQuantity },
    $set: { isDeadStock: false },
  };
  if (wholesalePrice !== undefined) {
    update.$set.wholesalePrice = wholesalePrice;
  }

  const product = await Product.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!product) throw new ApiError(404, 'Product not found');

  logger.info(`Restocked product "${product.name}": +${addedQuantity} ${product.unit}, total stock: ${product.stockQuantity}`);
  res.json({ success: true, message: `Added ${addedQuantity} ${product.unit} to "${product.name}"`, data: product });
});

/** DELETE /api/products/:id */
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: objectId }).parse(req.params);
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new ApiError(404, 'Product not found');

  logger.info(`Deleted product "${product.name}" (${product._id})`);
  res.json({ success: true, message: `Product "${product.name}" deleted successfully` });
});

/** GET /api/products  (POS item grid and Inventory table) */
export const listProducts = asyncHandler(async (req, res) => {
  const { q, category, limit } = listQuerySchema.parse(req.query);
  const filter = {};
  if (category && category !== 'ALL') filter.category = category;
  if (q) filter.name = new RegExp(escapeRegex(q), 'i');

  const products = await Product.find(filter)
    .populate('dealers.dealerId', 'name agencyName phone')
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  // If requester is Staff or not logged in, mask wholesale buy rate and dealer quotes
  const userRole = req.user?.role;
  const masked = products.map((p) => maskProductForRole(p, userRole));

  res.json({ success: true, count: masked.length, data: masked });
});

/** GET /api/products/low-stock */
export const getLowStock = asyncHandler(async (req, res) => {
  const { category } = lowStockQuerySchema.parse(req.query);
  const filter = { $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } };
  if (category && category !== 'ALL') filter.category = category;

  const products = await Product.find(filter)
    .populate('dealers.dealerId', 'name agencyName phone pendingBalance')
    .sort({ stockQuantity: 1, name: 1 })
    .lean();

  const userRole = req.user?.role;
  const masked = products.map((p) => maskProductForRole(p, userRole));

  res.json({ success: true, count: masked.length, data: masked });
});

/** GET /api/products/search?q=...  barcode exact match first, then ranked name/category regex match */
export const searchProducts = asyncHandler(async (req, res) => {
  const { q, limit } = searchQuerySchema.parse(req.query);
  const userRole = req.user?.role;

  // 1) Indexed exact barcode lookup (the scanner fast-path).
  const byBarcode = await Product.findOne({ barcode: q }).select('-dealers').lean();
  if (byBarcode) {
    const masked = [maskProductForRole(byBarcode, userRole)];
    return res.json({ success: true, matchType: 'barcode', count: 1, data: masked });
  }

  // 2) Case-insensitive, escaped (ReDoS-safe) partial match on name or category.
  const rx = new RegExp(escapeRegex(q), 'i');
  const lower = q.toLowerCase();
  const docs = await Product.find({ $or: [{ name: rx }, { category: rx }] })
    .select('-dealers')
    .limit(limit * 3)
    .lean();

  const rank = (p) => {
    const n = p.name.toLowerCase();
    if (n === lower) return 0;
    if (n.startsWith(lower)) return 1;
    if (n.split(/\s+/).some((w) => w.startsWith(lower))) return 2;
    return n.includes(lower) ? 3 : 4;
  };
  const data = docs.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, limit);
  const masked = data.map((p) => maskProductForRole(p, userRole));

  res.json({ success: true, matchType: 'name', count: masked.length, data: masked });
});

/** POST /api/products/seed-stress-test (Admin only) */
export const seedStressTest = asyncHandler(async (req, res) => {
  const count = Number(req.body?.count) || 600;
  logger.info(`Admin initiated stress test seed: generating ${count} products...`);
  const items = generateStressTestProducts(count);

  const ops = items.map((p) => ({
    updateOne: {
      filter: { barcode: p.barcode },
      update: { $setOnInsert: p },
      upsert: true,
    },
  }));

  await Product.bulkWrite(ops, { ordered: false });
  const total = await Product.countDocuments();
  logger.info(`Stress-test seed complete. Total products now in database: ${total}`);

  res.json({
    success: true,
    message: `Stress test dataset generated! Total items in catalog: ${total}`,
    totalCount: total,
  });
});

export default {
  createProduct,
  updateProduct,
  restockProduct,
  deleteProduct,
  listProducts,
  getLowStock,
  searchProducts,
  seedStressTest,
};
