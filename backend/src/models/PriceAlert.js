import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const { Schema } = mongoose;

const priceAlertSchema = new Schema(
  {
    productName: { type: String, required: true, trim: true, maxlength: 150, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    category: { type: String, trim: true, default: 'General' },
    currentPrice: { type: Number, required: true, min: 0 },
    projectedPrice: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: { values: ['INCREASE', 'DECREASE'], message: 'Direction must be INCREASE or DECREASE' }, required: true },
    effectiveDate: { type: Date, required: true },
    confidenceScore: { type: Number, required: true, min: 0, max: 100 }, // percent
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    reasonTags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] }, // e.g. "Import Duty Hike"
    estimatedOrderQty: { type: Number, default: 50, min: 1 }, // typical purchase size, used for "save Rs X" maths
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// TTL: alerts disappear 30 days after they take effect. Doubles as the sort index for upcoming alerts.
priceAlertSchema.index({ effectiveDate: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
priceAlertSchema.index({ direction: 1, effectiveDate: 1 });

priceAlertSchema.virtual('priceDelta').get(function priceDelta() {
  return Math.round((this.projectedPrice - this.currentPrice) * 100) / 100;
});
priceAlertSchema.virtual('changePercent').get(function changePercent() {
  if (!this.currentPrice) return 0;
  return Math.round(((this.projectedPrice - this.currentPrice) / this.currentPrice) * 1000) / 10;
});

priceAlertSchema.pre('validate', function checkDirection() {
  if (this.direction === 'INCREASE' && this.projectedPrice <= this.currentPrice) {
    this.invalidate('projectedPrice', 'Projected price must be higher than current price for an INCREASE alert');
  }
  if (this.direction === 'DECREASE' && this.projectedPrice >= this.currentPrice) {
    this.invalidate('projectedPrice', 'Projected price must be lower than current price for a DECREASE alert');
  }
});

priceAlertSchema.post('save', (doc) => logger.info(`Price alert: ${doc.productName} ${doc.direction} ${doc.currentPrice} -> ${doc.projectedPrice}`));

export default mongoose.models.PriceAlert || mongoose.model('PriceAlert', priceAlertSchema);
