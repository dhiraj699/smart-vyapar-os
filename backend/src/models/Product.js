import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const { Schema } = mongoose;

export const UNITS = ['kg', 'gm', 'litre', 'ml', 'pcs', 'packet'];

const dealerQuoteSchema = new Schema(
  {
    dealerId: { type: Schema.Types.ObjectId, ref: 'Dealer', required: true },
    quotedPrice: { type: Number, required: true, min: [0, 'Quoted price cannot be negative'] },
    schemeText: { type: String, trim: true, maxlength: 200, default: '' }, // e.g. "10+1", "Buy 12 get 1 free"
    // Optional structured scheme. If omitted, the optimizer parses schemeText.
    baseQuantity: { type: Number, min: 1 },
    freeUnits: { type: Number, min: 0 },
    quotedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 150, index: true },
    barcode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // many products may have no barcode
      set: (v) => (v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim()),
    },
    category: { type: String, trim: true, default: 'General', maxlength: 60 },
    unit: { type: String, enum: { values: UNITS, message: 'Unit must be one of: ' + UNITS.join(', ') }, default: 'pcs', required: true },
    wholesalePrice: { type: Number, required: true, min: [0, 'Wholesale price cannot be negative'] },
    sellingPrice: { type: Number, required: true, min: [0, 'Selling price cannot be negative'] },
    stockQuantity: { type: Number, default: 0, min: [0, 'Stock cannot be negative'] },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    dealers: {
      type: [dealerQuoteSchema],
      default: [],
      validate: {
        validator: (arr) => new Set(arr.map((d) => String(d.dealerId))).size === arr.length,
        message: 'A dealer can only be listed once per product',
      },
    },
    lastSoldAt: { type: Date, default: Date.now },
    isDeadStock: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* ---------------------------- Indexes ---------------------------- */
productSchema.index({ name: 'text', category: 'text' }, { weights: { name: 10, category: 2 }, name: 'product_text_idx' });
productSchema.index({ category: 1, lastSoldAt: -1 });
productSchema.index({ stockQuantity: 1, lastSoldAt: 1 }); // dead-capital scan
productSchema.index({ isDeadStock: 1 });

/* --------------------------- Virtuals ---------------------------- */
productSchema.virtual('marginPerUnit').get(function marginPerUnit() {
  return Math.round((this.sellingPrice - this.wholesalePrice) * 100) / 100;
});
productSchema.virtual('isLowStock').get(function isLowStock() {
  return this.stockQuantity <= this.lowStockThreshold;
});

/* ----------------------------- Statics --------------------------- */
/**
 * Atomic guarded stock deduction. The $gte guard lives in the filter, so two concurrent
 * checkouts can never push stock below zero. Returns the updated product or null when
 * the product does not exist OR stock is insufficient.
 */
productSchema.statics.deductStock = function deductStock(productId, quantity, session) {
  if (typeof quantity !== 'number' || quantity <= 0 || !Number.isFinite(quantity)) {
    throw new Error('Deduction quantity must be a positive finite number');
  }
  return this.findOneAndUpdate(
    { _id: productId, stockQuantity: { $gte: quantity } },
    { $inc: { stockQuantity: -quantity }, $set: { lastSoldAt: new Date(), isDeadStock: false } },
    { new: true, runValidators: true, session }
  );
};

/** Flag/unflag dead stock in bulk (used by the analytics sync option). */
productSchema.statics.syncDeadStockFlags = async function syncDeadStockFlags(cutoff) {
  const [marked, cleared] = await Promise.all([
    this.updateMany(
      {
        stockQuantity: { $gt: 0 },
        isDeadStock: false,
        $or: [{ lastSoldAt: { $lt: cutoff } }, { lastSoldAt: null }, { lastSoldAt: { $exists: false } }],
      },
      { $set: { isDeadStock: true } }
    ),
    this.updateMany(
      { isDeadStock: true, $or: [{ lastSoldAt: { $gte: cutoff } }, { stockQuantity: { $lte: 0 } }] },
      { $set: { isDeadStock: false } }
    ),
  ]);
  return { marked: marked.modifiedCount, cleared: cleared.modifiedCount };
};

/* ------------------------------ Hooks ---------------------------- */
productSchema.pre('save', function preSave() {
  if (this.sellingPrice < this.wholesalePrice) {
    logger.warn(`Product "${this.name}" is priced below cost (sell ${this.sellingPrice} < buy ${this.wholesalePrice})`);
  }
});

productSchema.post('save', (doc) => {
  if (doc.stockQuantity <= doc.lowStockThreshold) {
    logger.warn(`Low stock: "${doc.name}" has ${doc.stockQuantity} ${doc.unit} left`);
  }
});

// Fires after deductStock (findOneAndUpdate) so low-stock events are logged at the moment they occur.
productSchema.post('findOneAndUpdate', (doc) => {
  if (doc && doc.stockQuantity <= doc.lowStockThreshold) {
    logger.warn(`Low stock: "${doc.name}" has ${doc.stockQuantity} ${doc.unit} left (threshold ${doc.lowStockThreshold})`);
  }
});

export default mongoose.models.Product || mongoose.model('Product', productSchema);
