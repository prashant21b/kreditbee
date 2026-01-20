/**
 * Centralized Configuration Module
 * 
 * Loads all configuration from environment variables with sensible defaults.
 * All rate limiting, database, and Redis settings are externalized here.
 * 
 * Supports MySQL URL for production environments (Railway, Heroku, etc.)
 */

import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isDevelopment = nodeEnv === 'development';

/**
 * Parses MySQL URL into connection config
 * Format: mysql://user:password@host:port/database
 * 
 * @param {string} url - MySQL connection URL
 * @returns {Object} Parsed connection config
 */
function parseMySqlUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 3306,
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1), // Remove leading slash
    };
  } catch (error) {
    console.error('Failed to parse MYSQL_URL:', error.message);
    return null;
  }
}

// Determine MySQL config based on environment
let mysqlConfig;

// Priority: MYSQL_URL > individual env vars
if (process.env.MYSQL_URL) {
  // Parse MySQL URL (Railway, Heroku, etc.)
  mysqlConfig = parseMySqlUrl(process.env.MYSQL_URL);
  console.log('Using MYSQL_URL for database connection');
} else {
  // Use individual env vars for local development
  mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mutual_fund_analytics',
  };
  console.log('Using individual MYSQL_* vars for database connection');
}

const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv,
    isDevelopment,
  },

  // MySQL database configuration
  mysql: {
    ...mysqlConfig,
    // Connection pool settings for production workloads
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT, 10) || 10,
    waitForConnections: true,
    queueLimit: 0,
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // Key prefix for namespacing
    keyPrefix: 'mf_analytics:',
  },

  // External API (mfapi.in)
  mfApi: {
    baseUrl: process.env.MFAPI_BASE_URL || 'https://api.mfapi.in/mf',
    timeout: parseInt(process.env.MFAPI_TIMEOUT, 10) || 30000,
  },

  // Rate limiting configuration - THREE independent buckets
  // A request is allowed ONLY if all three buckets have tokens
  rateLimiting: {
    // Per-second bucket: 2 requests/second
    perSecond: {
      capacity: parseInt(process.env.RATE_LIMIT_PER_SECOND_CAPACITY, 10) || 2,
      refillRate: parseInt(process.env.RATE_LIMIT_PER_SECOND_REFILL_RATE, 10) || 2,
      intervalMs: parseInt(process.env.RATE_LIMIT_PER_SECOND_INTERVAL_MS, 10) || 1000,
    },
    // Per-minute bucket: 50 requests/minute
    perMinute: {
      capacity: parseInt(process.env.RATE_LIMIT_PER_MINUTE_CAPACITY, 10) || 50,
      refillRate: parseInt(process.env.RATE_LIMIT_PER_MINUTE_REFILL_RATE, 10) || 50,
      intervalMs: parseInt(process.env.RATE_LIMIT_PER_MINUTE_INTERVAL_MS, 10) || 60000,
    },
    // Per-hour bucket: 300 requests/hour
    perHour: {
      capacity: parseInt(process.env.RATE_LIMIT_PER_HOUR_CAPACITY, 10) || 300,
      refillRate: parseInt(process.env.RATE_LIMIT_PER_HOUR_REFILL_RATE, 10) || 300,
      intervalMs: parseInt(process.env.RATE_LIMIT_PER_HOUR_INTERVAL_MS, 10) || 3600000,
    },
  },

  // Scheduler configuration
  scheduler: {
    // Default: 6:00 AM daily
    syncCronSchedule: process.env.SYNC_CRON_SCHEDULE || '0 6 * * *',
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs',
  },

  // AMCs and categories to track
  // These define which mutual fund schemes to discover and sync
  schemeFilters: {
    amcs: [
      'ICICI Prudential',
      'HDFC',
      'Axis',
      'SBI',
      'Kotak',
    ],
    categories: [
      'Mid Cap',
      'Small Cap',
    ],
    // Only include Direct Growth plans
    mustInclude: ['Direct', 'Growth'],
  },

  // Analytics windows for precomputation
  analyticsWindows: ['1Y', '3Y', '5Y', '10Y'],

  // Window to days mapping
  windowToDays: {
    '1Y': 365,
    '3Y': 365 * 3,
    '5Y': 365 * 5,
    '10Y': 365 * 10,
  },
};

export default config;
