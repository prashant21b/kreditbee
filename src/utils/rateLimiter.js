/**
 * Redis-backed Token Bucket Rate Limiter
 * 
 * Implements a multi-bucket rate limiting strategy.
 * Supports both standard Redis (with Lua scripts) and Upstash Redis (REST API).
 * 
 * THREE INDEPENDENT BUCKETS (all must have tokens for request approval):
 * 1. per_second: 2 requests/second
 * 2. per_minute: 50 requests/minute  
 * 3. per_hour: 300 requests/hour
 */

import { getRedisClient, isUpstashRedis } from './redis.js';
import config from '../config/index.js';
import { logger } from '../logger/index.js';

// Redis key prefix for rate limiter buckets
const KEY_PREFIX = 'ratelimit:mfapi:';

/**
 * Lua script for atomic token bucket operations (for standard Redis)
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local intervalMs = tonumber(ARGV[3])
local tokensRequested = tonumber(ARGV[4])
local currentTimeMs = tonumber(ARGV[5])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  lastRefill = currentTimeMs
end

local elapsed = currentTimeMs - lastRefill
local tokensToAdd = math.floor((elapsed / intervalMs) * refillRate)

if tokensToAdd > 0 then
  tokens = math.min(capacity, tokens + tokensToAdd)
  lastRefill = currentTimeMs
end

if tokens >= tokensRequested then
  tokens = tokens - tokensRequested
  redis.call('HSET', key, 'tokens', tokens, 'last_refill', lastRefill)
  redis.call('EXPIRE', key, 7200)
  return {1, tokens, 0}
else
  local tokensNeeded = tokensRequested - tokens
  local waitTimeMs = math.ceil((tokensNeeded / refillRate) * intervalMs)
  redis.call('HSET', key, 'tokens', tokens, 'last_refill', lastRefill)
  redis.call('EXPIRE', key, 7200)
  return {0, tokens, waitTimeMs}
end
`;

let scriptSha = null;

/**
 * Loads the Lua script into Redis (for standard Redis)
 */
async function loadScript() {
  if (isUpstashRedis()) {
    // Upstash doesn't use Lua scripts, skip
    return 'upstash-no-lua';
  }
  
  if (!scriptSha) {
    const redis = getRedisClient();
    scriptSha = await redis.script('LOAD', TOKEN_BUCKET_LUA);
    logger.info('Rate limiter Lua script loaded', { sha: scriptSha });
  }
  return scriptSha;
}

/**
 * Check bucket for Upstash Redis (without Lua)
 */
async function checkBucketUpstash(bucketName, bucketConfig) {
  const redis = getRedisClient();
  const key = `${config.redis.keyPrefix}${KEY_PREFIX}${bucketName}`;
  const currentTimeMs = Date.now();

  try {
    // Get current state
    const bucket = await redis.hgetall(key);
    
    let tokens = bucket?.tokens ? parseFloat(bucket.tokens) : bucketConfig.capacity;
    let lastRefill = bucket?.last_refill ? parseInt(bucket.last_refill, 10) : currentTimeMs;

    // Calculate refill
    const elapsed = currentTimeMs - lastRefill;
    const tokensToAdd = Math.floor((elapsed / bucketConfig.intervalMs) * bucketConfig.refillRate);

    if (tokensToAdd > 0) {
      tokens = Math.min(bucketConfig.capacity, tokens + tokensToAdd);
      lastRefill = currentTimeMs;
    }

    // Check if we can consume
    if (tokens >= 1) {
      tokens = tokens - 1;
      
      // Update state
      await redis.hset(key, {
        tokens: tokens.toString(),
        last_refill: lastRefill.toString(),
      });
      await redis.expire(key, 7200);
      
      return {
        allowed: true,
        tokensRemaining: tokens,
        waitTimeMs: 0,
      };
    } else {
      // Calculate wait time
      const tokensNeeded = 1 - tokens;
      const waitTimeMs = Math.ceil((tokensNeeded / bucketConfig.refillRate) * bucketConfig.intervalMs);
      
      // Update state
      await redis.hset(key, {
        tokens: tokens.toString(),
        last_refill: lastRefill.toString(),
      });
      await redis.expire(key, 7200);
      
      return {
        allowed: false,
        tokensRemaining: tokens,
        waitTimeMs,
      };
    }
  } catch (error) {
    logger.error('Upstash bucket check failed', { bucket: bucketName, error: error.message });
    // On error, allow the request (fail open)
    return { allowed: true, tokensRemaining: 0, waitTimeMs: 0 };
  }
}

/**
 * Check bucket for standard Redis (with Lua)
 */
async function checkBucketStandard(bucketName, bucketConfig) {
  const redis = getRedisClient();
  const sha = await loadScript();
  const key = `${KEY_PREFIX}${bucketName}`;
  const currentTimeMs = Date.now();

  try {
    const result = await redis.evalsha(
      sha,
      1,
      key,
      bucketConfig.capacity,
      bucketConfig.refillRate,
      bucketConfig.intervalMs,
      1,
      currentTimeMs
    );

    return {
      allowed: result[0] === 1,
      tokensRemaining: result[1],
      waitTimeMs: result[2],
    };
  } catch (error) {
    if (error.message.includes('NOSCRIPT')) {
      scriptSha = null;
      return checkBucketStandard(bucketName, bucketConfig);
    }
    throw error;
  }
}

/**
 * Checks a single bucket for token availability
 */
async function checkBucket(bucketName, bucketConfig) {
  if (isUpstashRedis()) {
    return checkBucketUpstash(bucketName, bucketConfig);
  } else {
    return checkBucketStandard(bucketName, bucketConfig);
  }
}

/**
 * Peeks at bucket state without consuming tokens
 */
async function peekBucket(bucketName) {
  const redis = getRedisClient();
  const keyPrefix = isUpstashRedis() ? `${config.redis.keyPrefix}${KEY_PREFIX}` : KEY_PREFIX;
  const key = `${keyPrefix}${bucketName}`;
  
  const bucket = await redis.hgetall(key);
  
  return {
    tokens: bucket?.tokens ? parseFloat(bucket.tokens) : null,
    lastRefill: bucket?.last_refill ? parseInt(bucket.last_refill, 10) : null,
  };
}

/**
 * Main rate limiter function - checks all THREE buckets
 */
async function acquireToken(requestId = 'unknown') {
  const startTime = Date.now();
  const { rateLimiting } = config;
  
  const buckets = [
    { name: 'per_second', config: rateLimiting.perSecond },
    { name: 'per_minute', config: rateLimiting.perMinute },
    { name: 'per_hour', config: rateLimiting.perHour },
  ];

  const results = {};
  let allowed = true;
  let maxWaitTime = 0;

  for (const bucket of buckets) {
    const result = await checkBucket(bucket.name, bucket.config);
    results[bucket.name] = result;

    if (!result.allowed) {
      allowed = false;
      maxWaitTime = Math.max(maxWaitTime, result.waitTimeMs);
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Rate limit check', {
    request_id: requestId,
    allowed,
    wait_time_ms: allowed ? 0 : maxWaitTime,
    check_duration_ms: duration,
    buckets: {
      per_second: {
        tokens_remaining: results.per_second.tokensRemaining,
        allowed: results.per_second.allowed,
      },
      per_minute: {
        tokens_remaining: results.per_minute.tokensRemaining,
        allowed: results.per_minute.allowed,
      },
      per_hour: {
        tokens_remaining: results.per_hour.tokensRemaining,
        allowed: results.per_hour.allowed,
      },
    },
  });

  return {
    allowed,
    waitTimeMs: maxWaitTime,
    bucketStates: results,
  };
}

/**
 * Waits for rate limit tokens to become available
 */
async function waitForToken(requestId = 'unknown', maxWaitMs = 300000) {
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    const result = await acquireToken(requestId);

    if (result.allowed) {
      if (attempts > 1) {
        logger.info('Rate limit token acquired after waiting', {
          request_id: requestId,
          attempts,
          total_wait_ms: Date.now() - startTime,
        });
      }
      return true;
    }

    const waitTime = Math.min(result.waitTimeMs + 50, maxWaitMs - (Date.now() - startTime));
    
    if (waitTime <= 0) {
      break;
    }

    logger.info('Rate limit waiting for tokens', {
      request_id: requestId,
      wait_time_ms: waitTime,
      attempt: attempts,
    });

    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  logger.warn('Rate limit wait timeout', {
    request_id: requestId,
    max_wait_ms: maxWaitMs,
    elapsed_ms: Date.now() - startTime,
  });

  return false;
}

/**
 * Gets current rate limiter status for monitoring
 */
async function getStatus() {
  const buckets = ['per_second', 'per_minute', 'per_hour'];
  const status = {};

  for (const bucket of buckets) {
    status[bucket] = await peekBucket(bucket);
  }

  return {
    buckets: status,
    limits: {
      per_second: config.rateLimiting.perSecond.capacity,
      per_minute: config.rateLimiting.perMinute.capacity,
      per_hour: config.rateLimiting.perHour.capacity,
    },
  };
}

/**
 * Resets all rate limiter buckets
 */
async function resetBuckets() {
  const redis = getRedisClient();
  const buckets = ['per_second', 'per_minute', 'per_hour'];
  const keyPrefix = isUpstashRedis() ? `${config.redis.keyPrefix}${KEY_PREFIX}` : KEY_PREFIX;

  for (const bucket of buckets) {
    await redis.del(`${keyPrefix}${bucket}`);
  }

  logger.info('Rate limiter buckets reset');
}

export {
  acquireToken,
  waitForToken,
  getStatus,
  resetBuckets,
  loadScript,
};
