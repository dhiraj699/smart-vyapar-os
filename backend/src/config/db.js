import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const MAX_RETRIES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let listenersAttached = false;
let connectingPromise = null;

const formatErrorDiagnosis = (err) => {
  const msg = err?.message || String(err);
  if (msg.includes('SSL alert number 80') || msg.includes('tlsv1 alert internal error') || msg.includes('whitelist')) {
    return 'MongoDB Atlas TLS handshake failed (SSL alert 80). Your current client IP address is likely not whitelisted in MongoDB Atlas Network Access (https://cloud.mongodb.com).';
  }
  if (msg.includes('ECONNREFUSED')) {
    return 'Could not connect to MongoDB server (Connection Refused). Ensure MongoDB service is running.';
  }
  if (msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
    return 'Connection to MongoDB timed out. Check network connection and firewall settings.';
  }
  return msg;
};

const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    logger.info(`MongoDB connection established: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost. Driver will automatically attempt to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected successfully');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${formatErrorDiagnosis(err)}`, err);
  });

  mongoose.connection.on('close', () => {
    logger.info('MongoDB connection closed');
  });
};

const defaultOptions = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 20,
  minPoolSize: 2,
  heartbeatFrequencyMS: 10000,
  family: 4, // Forces IPv4 to prevent dual-stack IPv6 DNS lookup stalls on Windows/Linux
  retryWrites: true,
  w: 'majority',
  autoIndex: process.env.NODE_ENV !== 'production',
};

/**
 * Attempts connection to a URI with configured options.
 */
const tryConnect = async (uri, label = 'primary') => {
  return mongoose.connect(uri, defaultOptions);
};

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectingPromise) {
    return connectingPromise;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const primaryUri = process.env.MONGODB_URI;
  const fallbackUri = process.env.MONGODB_FALLBACK_URI || (isProd ? null : 'mongodb://127.0.0.1:27017/smart_vyapar');

  if (!primaryUri && !fallbackUri) {
    throw new Error('MONGODB_URI is not defined. Copy .env.example to .env and set it.');
  }

  mongoose.set('strictQuery', true);
  attachListeners();

  connectingPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      // 1. Try primary URI
      if (primaryUri) {
        try {
          await tryConnect(primaryUri, 'primary');
          logger.info(`MongoDB connected to primary [${mongoose.connection.host}/${mongoose.connection.name}]`);
          return mongoose.connection;
        } catch (err) {
          const diagnosis = formatErrorDiagnosis(err);
          logger.warn(`Primary MongoDB attempt ${attempt}/${MAX_RETRIES} failed: ${diagnosis}`);

          // If primary has TLS/IP whitelist error and fallback is available, attempt fallback immediately
          if (attempt === 1 && fallbackUri && fallbackUri !== primaryUri) {
            try {
              logger.info(`Attempting local fallback MongoDB connection: ${fallbackUri}`);
              await tryConnect(fallbackUri, 'fallback');
              logger.info(`MongoDB connected to fallback [${mongoose.connection.host}/${mongoose.connection.name}]`);
              return mongoose.connection;
            } catch (fallbackErr) {
              logger.debug(`Fallback connection also failed: ${fallbackErr.message}`);
            }
          }

          if (attempt === MAX_RETRIES) {
            // Check fallback one last time
            if (fallbackUri && fallbackUri !== primaryUri) {
              try {
                await tryConnect(fallbackUri, 'fallback');
                logger.info(`MongoDB connected to fallback [${mongoose.connection.host}/${mongoose.connection.name}]`);
                return mongoose.connection;
              } catch {
                // fall through to throw original
              }
            }
            throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts. ${diagnosis}`);
          }
        }
      } else if (fallbackUri) {
        try {
          await tryConnect(fallbackUri, 'fallback');
          logger.info(`MongoDB connected to fallback [${mongoose.connection.host}/${mongoose.connection.name}]`);
          return mongoose.connection;
        } catch (err) {
          logger.warn(`Fallback MongoDB attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
          if (attempt === MAX_RETRIES) throw err;
        }
      }

      const backoff = Math.min(1000 * 2 ** (attempt - 1), 10000);
      await sleep(backoff);
    }
    return null;
  })().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
};

export const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed cleanly');
    }
  } catch (err) {
    logger.error('Error while closing MongoDB connection', err);
  }
};

export default connectDB;
