/**
 * Express Application
 * 
 * Configures middleware, routes, and error handling.
 * This is the main application setup, separated from server startup for testability.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, createRequestLogger } from './logger/index.js';

// Import routes
import fundsRouter from './routes/funds.js';
import syncRouter from './routes/sync.js';
import adminRouter from './routes/admin.js';

const app = express();

// =============================================================================
// Middleware
// =============================================================================

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

/**
 * Request ID middleware
 * 
 * Generates a unique request ID for each incoming request.
 * Enables distributed tracing across logs.
 */
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4().slice(0, 8);
  res.setHeader('X-Request-ID', req.requestId);
  
  // Attach request-scoped logger
  req.logger = createRequestLogger(req.requestId);
  
  next();
});

/**
 * Request logging middleware
 * 
 * Logs incoming requests and response times.
 */
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    request_id: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      request_id: req.requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
    });
  });
  
  next();
});

// =============================================================================
// Routes
// =============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/funds', fundsRouter);
app.use('/sync', syncRouter);
app.use('/admin', adminRouter);

// =============================================================================
// Error Handling
// =============================================================================

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    path: req.originalUrl,
  });
});

/**
 * Global error handler
 * 
 * Catches all unhandled errors and returns a consistent error response.
 */
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    request_id: req.requestId,
    error: err.message,
    stack: err.stack,
  });
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message,
    request_id: req.requestId,
  });
});

export default app;
