/**
 * Redis Connection Manager
 * 
 * Supports both standard Redis (ioredis) and Upstash Redis (REST API).
 * Automatically selects based on environment variables.
 */

import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';
import config from '../config/index.js';
import { logger } from '../logger/index.js';

let redisClient = null;
let isUpstash = false;

/**
 * Creates and returns the Redis client.
 * Uses singleton pattern to ensure only one connection.
 * 
 * @returns {Object} Redis client instance (ioredis or Upstash)
 */
function getRedisClient() {
  if (!redisClient) {
    // Check if Upstash is configured
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      isUpstash = true;
      redisClient = new UpstashRedis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      
      logger.info('Upstash Redis client created', {
        url: process.env.UPSTASH_REDIS_REST_URL.slice(0, 30) + '...',
      });
    } else {
      // Use standard ioredis
      isUpstash = false;
      const options = {
        host: config.redis.host,
        port: config.redis.port,
        keyPrefix: config.redis.keyPrefix,
        retryStrategy: (times) => {
          const delay = Math.min(times * 100, 30000);
          logger.warn('Redis connection retry', { attempt: times, delay });
          return delay;
        },
        maxRetriesPerRequest: null,
      };

      if (config.redis.password) {
        options.password = config.redis.password;
      }

      redisClient = new Redis(options);

      redisClient.on('connect', () => {
        logger.info('Redis client connected', {
          host: config.redis.host,
          port: config.redis.port,
        });
      });

      redisClient.on('ready', () => {
        logger.info('Redis client ready');
      });

      redisClient.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      redisClient.on('close', () => {
        logger.info('Redis connection closed');
      });
    }
  }

  return redisClient;
}

/**
 * Returns whether we're using Upstash
 */
function isUpstashRedis() {
  return isUpstash;
}

/**
 * Tests Redis connectivity.
 * 
 * @returns {Promise<boolean>} True if ping succeeds
 */
async function testConnection() {
  try {
    const client = getRedisClient();
    
    if (isUpstash) {
      const result = await client.ping();
      logger.info('Upstash Redis connection test successful', { result });
      return result === 'PONG';
    } else {
      const result = await client.ping();
      logger.info('Redis connection test successful', { result });
      return result === 'PONG';
    }
  } catch (error) {
    logger.error('Redis connection test failed', { error: error.message });
    throw error;
  }
}

/**
 * Gracefully disconnects from Redis.
 */
async function closeConnection() {
  if (redisClient) {
    if (!isUpstash) {
      await redisClient.quit();
    }
    redisClient = null;
    logger.info('Redis connection closed gracefully');
  }
}

export {
  getRedisClient,
  isUpstashRedis,
  testConnection,
  closeConnection,
};
