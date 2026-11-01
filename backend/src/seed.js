import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './config/db.js';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Customer from './models/Customer.js';
import PriceAlert from './models/PriceAlert.js';
import logger from './utils/logger.js';

const day = 86_400_000;
const ago = (d) => new Date(Date.now() - d * day);
const ahead = (d) => new Date(Date.now() + d * day);

const run = async () => {
  await connectDB();
  const fresh = process.argv.includes('--fresh');
  if ((await Product.countDocuments()) > 0 && !fresh) {
    logger.warn('Database already has products. Re-run with --fresh to wipe dealers/products/customers/alerts first.');
    return;
  }
  if (fresh) await Promise.all([Dealer.deleteMany({}), Product.deleteMany({}), Customer.deleteMany({}), PriceAlert.deleteMany({})]);

  const [ram, gupta, singh] = await Dealer.create([
    { name: 'Ramesh Agarwal', agencyName: 'Agarwal Traders', phone: '9876543210', categories: ['noodles', 'snacks', 'biscuits'], pendingBalance: 4200 },
    { name: 'Suresh Gupta', agencyName: 'Gupta General Agency', phone: '9812345678', categories: ['rice', 'atta', 'oil', 'sugar'], pendingBalance: 0 },
    { name: 'Harpreet Singh', agencyName: 'Singh Wholesale Mart', phone: '9934567890', categories: ['oil', 'sugar', 'tea', 'noodles'], pendingBalance: 1500 },
  ]);

  await Product.create([
    { name: 'Maggi 2-Minute Noodles 70g', barcode: '8901058000290', category: 'noodles', unit: 'packet', wholesalePrice: 11.2, sellingPrice: 14, stockQuantity: 6, lowStockThreshold: 20, lastSoldAt: ago(1),
      dealers: [{ dealerId: ram._id, quotedPrice: 11.2, schemeText: '10+1' }, { dealerId: singh._id, quotedPrice: 10.9, schemeText: '' }] },
    { name: 'Tata Salt 1kg', barcode: '8904043901015', category: 'salt', unit: 'packet', wholesalePrice: 22, sellingPrice: 28, stockQuantity: 40, lowStockThreshold: 15, lastSoldAt: ago(2),
      dealers: [{ dealerId: gupta._id, quotedPrice: 22, schemeText: 'Buy 12 get 1 free' }] },
    { name: 'Sugar (Loose)', category: 'sugar', unit: 'kg', wholesalePrice: 41, sellingPrice: 46, stockQuantity: 8, lowStockThreshold: 25, lastSoldAt: ago(1),
      dealers: [{ dealerId: gupta._id, quotedPrice: 41 }, { dealerId: singh._id, quotedPrice: 40.5, schemeText: '50+2' }] },
    { name: 'Fortune Sunflower Oil 1L', barcode: '8906007790105', category: 'oil', unit: 'litre', wholesalePrice: 128, sellingPrice: 142, stockQuantity: 14, lowStockThreshold: 12, lastSoldAt: ago(3),
      dealers: [{ dealerId: gupta._id, quotedPrice: 128 }, { dealerId: singh._id, quotedPrice: 126, schemeText: '12+1' }] },
    { name: 'Aashirvaad Atta 5kg', barcode: '8901725181221', category: 'atta', unit: 'packet', wholesalePrice: 232, sellingPrice: 255, stockQuantity: 9, lowStockThreshold: 8, lastSoldAt: ago(4),
      dealers: [{ dealerId: gupta._id, quotedPrice: 232 }] },
    { name: 'Parle-G Biscuit 250g', barcode: '8901719101120', category: 'biscuits', unit: 'packet', wholesalePrice: 18, sellingPrice: 22, stockQuantity: 50, lowStockThreshold: 20, lastSoldAt: ago(2),
      dealers: [{ dealerId: ram._id, quotedPrice: 18, schemeText: '24+2' }] },
    { name: 'Taj Mahal Tea 250g', barcode: '8901030000000', category: 'tea', unit: 'packet', wholesalePrice: 118, sellingPrice: 135, stockQuantity: 30, lowStockThreshold: 10, lastSoldAt: ago(70),
      dealers: [{ dealerId: singh._id, quotedPrice: 118 }] },
    { name: 'Kurkure Masala Munch 90g', barcode: '8901491101837', category: 'snacks', unit: 'packet', wholesalePrice: 16, sellingPrice: 20, stockQuantity: 60, lowStockThreshold: 20, lastSoldAt: ago(58),
      dealers: [{ dealerId: ram._id, quotedPrice: 16 }] },
    { name: 'Toor Dal 1kg', category: 'dal', unit: 'kg', wholesalePrice: 138, sellingPrice: 155, stockQuantity: 22, lowStockThreshold: 10, lastSoldAt: ago(50),
      dealers: [{ dealerId: gupta._id, quotedPrice: 138 }] },
  ]);

  await Customer.create([
    { name: 'Anita Devi', phone: '9801112233', trustScore: 5 },
    { name: 'Raju Prasad', phone: '9801112244', totalUdhar: 600, trustScore: 3.4,
      paymentHistory: [{ billId: new mongoose.Types.ObjectId(), amount: 600, dueDate: ago(10) },
        { billId: new mongoose.Types.ObjectId(), amount: 300, dueDate: ago(40), clearedDate: ago(32) }] },
    { name: 'Mohan Lal', phone: '9801112255', totalUdhar: 1400, trustScore: 2,
      paymentHistory: [{ billId: new mongoose.Types.ObjectId(), amount: 1400, dueDate: ago(62) }] },
  ]);

  await PriceAlert.create([
    { productName: 'Fortune Sunflower Oil 1L', category: 'oil', currentPrice: 128, projectedPrice: 138, direction: 'INCREASE', effectiveDate: ahead(5), confidenceScore: 86,
      reason: 'Government raised import duty on edible oils', reasonTags: ['Import Duty Hike'], estimatedOrderQty: 60 },
    { productName: 'Sugar (Loose)', category: 'sugar', currentPrice: 41, projectedPrice: 38.5, direction: 'DECREASE', effectiveDate: ahead(9), confidenceScore: 72,
      reason: 'Fresh crushing season stock arriving at mandis', reasonTags: ['Fresh Harvest', 'Mandi Supply Surge'], estimatedOrderQty: 100 },
    { productName: 'Toor Dal 1kg', category: 'dal', currentPrice: 138, projectedPrice: 149, direction: 'INCREASE', effectiveDate: ahead(3), confidenceScore: 64,
      reason: 'Low arrivals in Maharashtra mandis', reasonTags: ['Mandi Supply Shortage'], estimatedOrderQty: 40 },
  ]);

  logger.info('Seed complete: 3 dealers, 9 products (2 dead-stock, several low-stock), 3 customers, 3 price alerts');
};

run()
  .catch((e) => { logger.error('Seed failed', e); process.exitCode = 1; })
  .finally(disconnectDB);
