import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { connectDB, disconnectDB } from './src/config/db.js';
import logger, { requestLogger } from './src/utils/logger.js';
import { notFound, errorHandler } from './src/middlewares/errorHandler.js';

import saleRoutes from './src/routes/saleRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import analyticsRoutes from './src/routes/analyticsRoutes.js';
import procurementRoutes from './src/routes/procurementRoutes.js';
import customerRoutes from './src/routes/customerRoutes.js';
import dealerRoutes from './src/routes/dealerRoutes.js';
import priceAlertRoutes from './src/routes/priceAlertRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import chatRoutes from './src/routes/chatRoutes.js';
import { ensureDefaultAccounts } from './src/controllers/authController.js';

const app = express();
app.disable('x-powered-by');

// Security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: false, // allow thermal receipt iframes and QR SVGs
    crossOriginEmbedderPolicy: false,
  })
);

// Production-ready CORS whitelist
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...configuredOrigins, ...defaultOrigins])];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      // Allow localhost on any port
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      // Allow common production cloud deployments (Vercel, Render)
      if (/^https:\/\/.*(\.vercel\.app|\.onrender\.com|\.render\.com)$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);

// Rate limiting: general API protection + strict login brute-force guard
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again in a few minutes.',
  },
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});
app.use('/api/auth/login', authLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/**
 * Dedicated production health-check endpoint
 */
app.get('/api/health', (_req, res) => {
  const readyState = mongoose.connection.readyState;
  const dbUp = readyState === 1;
  const mem = process.memoryUsage();

  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    service: 'smart-vyapar-os',
    version: '1.2.0-production',
    uptimeSeconds: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    db: DB_STATES[readyState] || 'unknown',
    dbHost: dbUp ? `${mongoose.connection.host}/${mongoose.connection.name}` : null,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// Fast-fail middleware: if DB is not ready, return 503 rather than waiting 30s socket timeout
const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database connection is currently degraded or reconnecting. Please retry in a few moments.',
      dbState: DB_STATES[mongoose.connection.readyState] || 'unknown',
    });
  }
  next();
};

app.use('/api/auth', requireDatabase, authRoutes);
app.use('/api/chat', requireDatabase, chatRoutes);
app.use('/api/sales', requireDatabase, saleRoutes);
app.use('/api/products', requireDatabase, productRoutes);
app.use('/api/analytics', requireDatabase, analyticsRoutes);
app.use('/api/procurement', requireDatabase, procurementRoutes);
app.use('/api/customers', requireDatabase, customerRoutes);
app.use('/api/dealers', requireDatabase, dealerRoutes);
app.use('/api/price-alerts', requireDatabase, priceAlertRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
let server;

let backgroundReconnectTimer = null;
const scheduleBackgroundReconnect = () => {
  if (backgroundReconnectTimer) return;
  backgroundReconnectTimer = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      clearInterval(backgroundReconnectTimer);
      backgroundReconnectTimer = null;
      return;
    }
    logger.info('Running background reconnect attempt to database...');
    try {
      await connectDB();
      if (mongoose.connection.readyState === 1) {
        logger.info('Database restored in background; service fully operational');
        await ensureDefaultAccounts();
        clearInterval(backgroundReconnectTimer);
        backgroundReconnectTimer = null;
      }
    } catch (err) {
      logger.debug(`Background reconnect pending: ${err.message}`);
    }
  }, 10000);
  backgroundReconnectTimer.unref();
};

const start = async () => {
  try {
    await connectDB();
    await ensureDefaultAccounts();
  } catch (err) {
    logger.warn(`Initial database connection failed (${err.message}). Starting server in degraded mode and retrying in background.`);
    scheduleBackgroundReconnect();
  }

  server = app.listen(PORT, () => {
    logger.info(`Smart Vyapar OS API listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
};

const shutdown = async (signal) => {
  logger.warn(`${signal} received - shutting down gracefully`);
  const forceTimer = setTimeout(() => process.exit(1), 10000);
  forceTimer.unref();

  if (backgroundReconnectTimer) clearInterval(backgroundReconnectTimer);

  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception - exiting', err);
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

export default app;
