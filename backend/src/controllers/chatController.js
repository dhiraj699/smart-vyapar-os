import { z } from 'zod';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';
import Dealer from '../models/Dealer.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { round2 } from '../utils/mathHelpers.js';

const messageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(1000),
  history: z
    .array(
      z.object({
        sender: z.enum(['user', 'assistant']),
        text: z.string(),
      })
    )
    .optional()
    .default([]),
});

/**
 * Role-aware contextual smart assistant for Smart Vyapar OS
 */
export const handleChatMessage = asyncHandler(async (req, res) => {
  const { message, history } = messageSchema.parse(req.body);
  const user = req.user || { role: 'staff', name: 'User' };
  const role = user.role;
  const lowerMsg = message.toLowerCase();

  logger.info(`Chat query from ${user.name} [${role}]: "${message}"`);

  // Block sensitive queries for non-admins
  if (role !== 'admin' && (lowerMsg.includes('wholesale') || lowerMsg.includes('profit') || lowerMsg.includes('margin') || lowerMsg.includes('dead capital') || lowerMsg.includes('kharid'))) {
    return res.json({
      success: true,
      reply: `🔒 **Confidential Information:** Wholesale buying prices, profit margins, and dead capital metrics are restricted to the **Store Owner (Dukandaar)**.\n\nAs counter staff, you can ask about: **stock levels, item locations, today's bill counts, customer udhar lookups, or barcode help**.`,
      suggestedChips: ['Check low stock', "Today's sales count", 'How to bill offline?', 'Search product'],
    });
  }

  // 1. Gather live contextual store data
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalProducts, lowStockItems, todaySalesAgg, topSellersAgg, udharAgg] = await Promise.all([
    Product.countDocuments(),
    Product.find({ $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } })
      .select('name stockQuantity unit lowStockThreshold sellingPrice')
      .limit(6)
      .lean(),
    Sale.aggregate([
      { $match: { createdAt: { $gte: todayStart } } },
      { $group: { _id: null, totalRevenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.name', totalQty: { $sum: '$items.quantity' }, totalRev: { $sum: '$items.total' } } },
      { $sort: { totalQty: -1 } },
      { $limit: 5 },
    ]),
    Customer.aggregate([
      { $group: { _id: null, totalUdhar: { $sum: '$totalUdhar' }, count: { $sum: 1 } } },
    ]),
  ]);

  const todayRevenue = round2(todaySalesAgg[0]?.totalRevenue || 0);
  const todayBillsCount = todaySalesAgg[0]?.count || 0;
  const totalUdhar = round2(udharAgg[0]?.totalUdhar || 0);

  // 2. Intelligent pattern & intent matching
  let reply = '';
  let suggestedChips = [];

  // Low stock query
  if (lowerMsg.includes('low stock') || lowerMsg.includes('khatam') || lowerMsg.includes('reorder') || lowerMsg.includes('out of stock')) {
    if (lowStockItems.length === 0) {
      reply = `✅ **All good!** No items are currently below their low-stock threshold in your catalog of **${totalProducts}** products.`;
    } else {
      const list = lowStockItems
        .map((p) => `• **${p.name}**: only **${p.stockQuantity} ${p.unit}** left (Alert limit: ${p.lowStockThreshold})`)
        .join('\n');
      reply = `⚠️ **Low Stock Alert (${lowStockItems.length} items critical):**\n\n${list}\n\n💡 *Tip: Go to "Dealer Orders" to generate optimized supplier procurement orders.*`;
    }
    suggestedChips = ["Today's total sales", 'Top selling items', 'Customer udhar balance'];
  }

  // Today's sales & revenue
  else if (lowerMsg.includes('today') || lowerMsg.includes('sales') || lowerMsg.includes('aaj') || lowerMsg.includes('revenue') || lowerMsg.includes('collection')) {
    if (role === 'admin') {
      reply = `📊 **Today's Business Summary:**\n\n• Total Bills Created: **${todayBillsCount} invoices**\n• Total Collection: **₹${todayRevenue.toLocaleString('en-IN')}**\n• Total Active SKUs: **${totalProducts} products**\n• Outstanding Udhar: **₹${totalUdhar.toLocaleString('en-IN')}**`;
    } else {
      reply = `🧾 **Today's Counter Summary:**\n\n• Completed Bills: **${todayBillsCount} customers served today**\n• Status: Billing POS running smoothly with auto-print & UPI active!`;
    }
    suggestedChips = ['Top selling items', 'Check low stock', 'Customer udhar balance'];
  }

  // Top selling products
  else if (lowerMsg.includes('top') || lowerMsg.includes('fast moving') || lowerMsg.includes('best seller') || lowerMsg.includes('popular')) {
    if (topSellersAgg.length === 0) {
      reply = `📦 Not enough sales recorded yet today to calculate top movers. Create a few bills in POS to see live ranking!`;
    } else {
      const list = topSellersAgg
        .map((t, idx) => `${idx + 1}. **${t._id}** — **${t.totalQty} units** sold (₹${round2(t.totalRev)})`)
        .join('\n');
      reply = `🔥 **Top Selling Products (Fastest Movers):**\n\n${list}\n\nKeep these items stocked near the billing counter for fast checkout!`;
    }
    suggestedChips = ['Check low stock', "Today's total sales", 'How to bill offline?'];
  }

  // Udhar / Credit queries
  else if (lowerMsg.includes('udhar') || lowerMsg.includes('credit') || lowerMsg.includes('pending') || lowerMsg.includes('khata')) {
    if (role === 'admin') {
      reply = `📒 **Customer Udhar (Khata Ledger):**\n\n• Total Market Balance: **₹${totalUdhar.toLocaleString('en-IN')}**\n• Active Customers: **${udharAgg[0]?.count || 0} registered**\n\n💡 Customers with trust score ≥ 3 have high repayment reliability. You can send UPI payment links directly from the POS customer panel.`;
    } else {
      reply = `📒 **Udhar Billing Guide:**\n\nTo give credit to a customer, select **"Udhar"** payment mode in the POS cart, enter the customer's **10-digit mobile number**. The system checks their credit limit and trust badge automatically!`;
    }
    suggestedChips = ["Today's total sales", 'Check low stock', 'How to bill offline?'];
  }

  // Offline mode / PWA queries
  else if (lowerMsg.includes('offline') || lowerMsg.includes('internet') || lowerMsg.includes('pwa') || lowerMsg.includes('wifi')) {
    reply = `⚡ **Offline Fallback Instructions:**\n\n1. If internet goes down, **Smart Vyapar OS continues billing without interruption**.\n2. Invoices are generated as \`OFF-YYYYMMDD-XXXX\` and receipts print immediately with dynamic UPI QR.\n3. Bills queue locally in storage. When internet restores, click **"Sync Now"** in the top header or let auto-sync upload them automatically!`;
    suggestedChips = ['Printer calibration help', "Today's total sales", 'Check low stock'];
  }

  // Printer / Thermal help
  else if (lowerMsg.includes('print') || lowerMsg.includes('thermal') || lowerMsg.includes('printer') || lowerMsg.includes('paper') || lowerMsg.includes('58mm') || lowerMsg.includes('80mm')) {
    reply = `🖨️ **Thermal Printer Guidelines:**\n\n• **58mm (2-inch)**: Compact roll format, ideal for mobile Bluetooth POS.\n• **80mm (3-inch)**: Standard full-detail format with Rate, Qty, and Amt columns.\n• Use the **"🖨️ Printer Test"** button in the header to calibrate zero-margins and verify PhonePe/GPay QR code scanability before rush hours!`;
    suggestedChips = ['How to bill offline?', 'Check low stock', "Today's total sales"];
  }

  // Barcode scanner help
  else if (lowerMsg.includes('barcode') || lowerMsg.includes('scanner') || lowerMsg.includes('scan')) {
    reply = `🔫 **Barcode Scanner Setup:**\n\n• Plug in any **USB or Bluetooth 1D/2D scanner**.\n• Look for the green **"Scanner Ready 🟢"** indicator in POS billing.\n• You can scan items from anywhere on screen — the system detects fast keystrokes, beeps audio confirmation, and adds the product in <5ms!`;
    suggestedChips = ['Check low stock', "Today's total sales", 'Top selling items'];
  }

  // General help or greeting
  else {
    reply = `Namaste ${user.name}! 🙏 I am your **Smart Vyapar AI Assistant**.\n\nI can answer real-time questions about your store:\n• **"Check low stock"** — view items needing re-order\n• **"Today's total sales"** — live revenue and bill counts\n• **"Top selling items"** — fast-moving product ranking\n• **"Customer udhar"** — outstanding credit balance\n• **"Offline billing"** — how to sell without internet\n\nWhat would you like to check right now?`;
    suggestedChips = ['Check low stock', "Today's total sales", 'Top selling items', 'Customer udhar balance'];
  }

  res.json({
    success: true,
    reply,
    suggestedChips,
    timestamp: new Date().toISOString(),
  });
});

export default {
  handleChatMessage,
};
