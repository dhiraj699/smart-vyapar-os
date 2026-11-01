import 'dotenv/config';
import { connectDB, disconnectDB } from './config/db.js';
import Product from './models/Product.js';
import { generateStressTestProducts } from './utils/stressTestData.js';
import logger from './utils/logger.js';

const targetCount = Number(process.argv[2]) || 650;

async function run() {
  await connectDB();
  logger.info(`Generating ${targetCount} realistic retail stress-test products...`);

  const items = generateStressTestProducts(targetCount);

  // Bulk upsert by barcode
  const ops = items.map((p) => ({
    updateOne: {
      filter: { barcode: p.barcode },
      update: { $setOnInsert: p },
      upsert: true,
    },
  }));

  const res = await Product.bulkWrite(ops, { ordered: false });
  const total = await Product.countDocuments();

  logger.info(`Stress-test seed completed! Added/updated items. Total products in database: ${total}`);
}

run()
  .catch((err) => {
    logger.error('Stress test seeding failed', err);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
