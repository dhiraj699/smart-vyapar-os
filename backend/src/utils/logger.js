const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const threshold = () => LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

const write = (level, message, meta) => {
  if (LEVELS[level] > threshold()) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta instanceof Error) {
    out(line, `\n  ${meta.stack || meta.message}`);
  } else if (meta !== undefined) {
    out(line, typeof meta === 'string' ? meta : JSON.stringify(meta));
  } else {
    out(line);
  }
};

const logger = {
  error: (m, meta) => write('error', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  info: (m, meta) => write('info', m, meta),
  debug: (m, meta) => write('debug', m, meta),
};

export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    write(level, `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms)`);
  });
  next();
};

export default logger;
