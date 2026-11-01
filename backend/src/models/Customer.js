import mongoose from 'mongoose';
import { normalizePhone, PHONE_REGEX } from '../utils/phone.js';
import logger from '../utils/logger.js';

const { Schema } = mongoose;

const paymentHistorySchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    amount: { type: Number, required: true, min: 0 }, // outstanding portion of this bill
    dueDate: { type: Date, required: true },
    clearedDate: { type: Date },
    wasDelayed: { type: Boolean, default: false },
  },
  { _id: true }
);

const customerSchema = new Schema(
  {
    name: { type: String, required: [true, 'Customer name is required'], trim: true, maxlength: 100, index: true },
    phone: {
      type: String,
      required: [true, 'Customer phone is required'],
      unique: true,
      trim: true,
      set: normalizePhone,
      validate: { validator: (v) => PHONE_REGEX.test(v), message: 'Phone must be a valid 10-digit Indian mobile number' },
    },
    totalUdhar: { type: Number, default: 0, min: [0, 'Udhar balance cannot be negative'] },
    maxCreditLimit: { type: Number, default: 2000, min: 0 },
    trustScore: { type: Number, min: 1, max: 5, default: 5 },
    paymentHistory: { type: [paymentHistorySchema], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

customerSchema.index({ totalUdhar: -1 });
customerSchema.index({ trustScore: 1 });
customerSchema.index({ 'paymentHistory.dueDate': 1, 'paymentHistory.clearedDate': 1 });

customerSchema.virtual('availableCredit').get(function availableCredit() {
  return Math.max(0, Math.round((this.maxCreditLimit - this.totalUdhar) * 100) / 100);
});

customerSchema.pre('save', function preSave() {
  for (const entry of this.paymentHistory) {
    if (entry.clearedDate && entry.dueDate) {
      entry.wasDelayed = new Date(entry.clearedDate) > new Date(entry.dueDate);
    }
  }
  if (this.totalUdhar > this.maxCreditLimit) {
    logger.warn(`Customer ${this.phone} is over credit limit (${this.totalUdhar} > ${this.maxCreditLimit})`);
  }
});

customerSchema.post('save', (doc) => logger.debug(`Customer saved: ${doc.name} (${doc.phone}) udhar=${doc.totalUdhar}`));

export default mongoose.models.Customer || mongoose.model('Customer', customerSchema);
