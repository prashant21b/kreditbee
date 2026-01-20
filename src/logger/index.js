/**
 * Winston Logger Configuration
 * 
 * Features:
 * - JSON structured logging for machine parsing
 * - Daily rotation with compression
 * - Request ID injection for distributed tracing
 * - Separate error log file
 * - Console output for development
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../config/index.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logDir = path.resolve(process.cwd(), config.logging.dir);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for structured JSON logs
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development (more readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, request_id, ...meta }) => {
    const reqId = request_id ? `[${request_id}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${reqId} ${message}${metaStr}`;
  })
);

// Daily rotate file transport for all logs
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: jsonFormat,
  level: config.logging.level,
});

// Separate error log file for easier debugging
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: jsonFormat,
  level: 'error',
});

// Create the main logger
const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'mutual-fund-analytics' },
  transports: [
    fileRotateTransport,
    errorFileTransport,
  ],
});

// Add console transport for non-production environments
if (config.server.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

/**
 * Factory function to create a request-scoped logger
 * 
 * @param {string} requestId - Unique request identifier
 * @returns {Object} Logger with request_id injected
 */
function createRequestLogger(requestId) {
  return {
    info: (message, meta = {}) => logger.info(message, { request_id: requestId, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { request_id: requestId, ...meta }),
    error: (message, meta = {}) => logger.error(message, { request_id: requestId, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { request_id: requestId, ...meta }),
  };
}

export { logger, createRequestLogger };
