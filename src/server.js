/**
 * Server Entry Point
 * 
 * Initializes database connections, starts the HTTP server,
 * and handles graceful shutdown.
 */

import app from './app.js';
import config from './config/index.js';
import { logger } from './logger/index.js';
import * as db from './db/connection.js';
import * as redis from './utils/redis.js';
import { loadScript as loadRateLimiterScript } from './utils/rateLimiter.js';
import scheduler from './jobs/scheduler.js';

/**
 * Initializes all required connections and services
 */
async function initialize() {
  logger.info('Initializing server...');
  
  try {
    // Test MySQL connection
    logger.info('Testing MySQL connection...');
    await db.testConnection();
    
    // Test Redis connection
    logger.info('Testing Redis connection...');
    await redis.testConnection();
    
    // Load rate limiter Lua script
    logger.info('Loading rate limiter script...');
    await loadRateLimiterScript();
    
    // Start scheduler for automated syncs
    logger.info('Starting scheduler...');
    scheduler.start();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Initialization failed', { error: error.message });
    throw error;
  }
}

/**
 * Starts the HTTP server
 */
async function startServer() {
  await initialize();
  
  const port = config.server.port;
  
  const server = app.listen(port, () => {
    logger.info(`Server started on port ${port}`, {
      port,
      env: config.server.nodeEnv,
    });
    
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         Mutual Fund Analytics API Server                   ║
╠════════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${port}                        ║
║  Health:     http://localhost:${port}/health                 ║
║  Docs:       See README.md for API documentation           ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /funds              - List all funds               ║
║    GET  /funds/:code        - Get fund details             ║
║    GET  /funds/:code/analytics - Get fund analytics        ║
║    GET  /funds/rank         - Rank funds by metrics        ║
║    POST /sync/trigger       - Trigger data sync            ║
║    GET  /sync/status        - Get sync status              ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
  
  // ==========================================================================
  // Graceful Shutdown
  // ==========================================================================
  
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');
      
      try {
        // Stop scheduler
        scheduler.stop();
        
        // Close database connection
        await db.closePool();
        
        // Close Redis connection
        await redis.closeConnection();
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    });
    
    // Force exit after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };
  
  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
  
  return server;
}

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  console.error('Failed to start server:', error);
  process.exit(1);
});
