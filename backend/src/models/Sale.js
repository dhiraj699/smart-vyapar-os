import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { round2 } from '../utils/mathHelpers.js';

const { Schema } = mongoose;

export const PAYMENT_MODES = ['Cash', 'UPI', 'Udhar', 'Split'];

const saleItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: [0.001, 'Quantity must be positive'] },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const saleSchema = new Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^INV-\d{8}-\d{4,}$/, 'Bill number must look like INV-YYYYMMDD-XXXX'],
    },
    customer: {
      name: { type: String, trim: true, default: 'Walk-in Customer' },
      phone: { type: String, trim: true },
      customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    },
    items: {
      type: [saleItemSchema],
      validate: { validator: (arr) => Array.isArray(arr) && arr.length > 0, message: 'A bill needs at least one item' },
    },
    subTotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    paymentMode: { type: String, enum: { values: PAYMENT_MODES, message: 'Invalid payment mode' }, required: true },
    splitBreakdown: {
      cash: { type: Number, default: 0, min: 0 },
      upi: { type: Number, default: 0, min: 0 },
      udhar: { type: Number, default: 0, min: 0 },
    },
    udharDueDate: { type: Date },
    cashier: {
      id: { type: Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, trim: true },
      role: { type: String, trim: true },
    },
    offlineRef: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ 'customer.phone': 1, createdAt: -1 });
saleSchema.index({ 'customer.customerId': 1, createdAt: -1 });
saleSchema.index({ 'items.product': 1, createdAt: -1 }); // fast-mover aggregation
saleSchema.index({ paymentMode: 1, createdAt: -1 });

saleSchema.virtual('udharAmount').get(function udharAmount() {
  if (this.paymentMode === 'Udhar') return this.grandTotal;
  if (this.paymentMode === 'Split') return this.splitBreakdown?.udhar || 0;
  return 0;
});

/** Never trust client maths: totals are always recomputed from line items before validation. */
saleSchema.pre('validate', function recomputeTotals() {
  if (!this.items?.length) return;

  let sub = 0;
  for (const it of this.items) {
    it.total = round2(it.quantity * it.unitPrice);
    sub += it.total;
  }
  this.subTotal = round2(sub);
  if (this.discount > this.subTotal) this.invalidate('discount', 'Discount cannot exceed the bill subtotal');
  this.grandTotal = round2(this.subTotal - this.discount);

  if (this.paymentMode === 'Split') {
    const s = this.splitBreakdown || {};
    const sum = round2((s.cash || 0) + (s.upi || 0) + (s.udhar || 0));
    if (sum !== this.grandTotal) this.invalidate('splitBreakdown', `Split amounts (${sum}) must add up to the grand total (${this.grandTotal})`);
  }
  if (this.udharAmount > 0 && !this.udharDueDate) this.invalidate('udharDueDate', 'Udhar due date is required for credit sales');
});

/** Invoices are legal records: block any mutation through query helpers. */
const immutable = function immutable() {
  throw new Error('Sale invoices are immutable and cannot be updated or deleted');
};
saleSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'deleteMany'], immutable);
saleSchema.pre('deleteOne', { document: false, query: true }, immutable);

saleSchema.post('save', (doc) => logger.info(`Invoice ${doc.billNumber} saved: Rs ${doc.grandTotal} via ${doc.paymentMode}`));

export default mongoose.models.Sale || mongoose.model('Sale', saleSchema);
