import mongoose from 'mongoose';
import { normalizePhone, PHONE_REGEX } from '../utils/phone.js';
import logger from '../utils/logger.js';

const { Schema } = mongoose;

const dealerSchema = new Schema(
  {
    name: { type: String, required: [true, 'Dealer name is required'], trim: true, maxlength: 100, index: true },
    agencyName: { type: String, trim: true, maxlength: 150, default: '' },
    phone: {
      type: String,
      required: [true, 'Dealer phone is required'],
      unique: true,
      trim: true,
      set: normalizePhone,
      validate: { validator: (v) => PHONE_REGEX.test(v), message: 'Phone must be a valid 10-digit Indian mobile number' },
    },
    categories: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 60 }],
      default: [],
    },
    pendingBalance: { type: Number, default: 0 }, // amount we owe this dealer (Rs); negative = advance paid
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

dealerSchema.index({ categories: 1 });

dealerSchema.pre('save', function dedupeCategories() {
  if (this.isModified('categories')) {
    this.categories = [...new Set(this.categories.filter(Boolean))];
  }
});

dealerSchema.post('save', (doc) => logger.debug(`Dealer saved: ${doc.name} (${doc.phone})`));

export default mongoose.models.Dealer || mongoose.model('Dealer', dealerSchema);
