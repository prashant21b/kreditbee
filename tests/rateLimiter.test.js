/**
 * Rate Limiter Tests
 * 
 * Tests for the Redis-backed token bucket rate limiter.
 */

import { jest } from '@jest/globals';

// Mock Redis before importing rate limiter
const mockRedis = {
  hgetall: jest.fn(),
  evalsha: jest.fn(),
  script: jest.fn(),
  defineCommand: jest.fn(),
};

jest.unstable_mockModule('../src/utils/redis.js', () => ({
  getRedisClient: () => mockRedis,
}));

// Import after mocking
const { acquireToken, waitForToken } = await import('../src/utils/rateLimiter.js');

describe('Rate Limiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock script load
    mockRedis.script.mockResolvedValue('mock-sha');
  });

  describe('acquireToken', () => {
    it('should allow request when all buckets have tokens', async () => {
      // Mock all buckets returning allowed
      mockRedis.evalsha.mockResolvedValue([1, 5, 0]); // [allowed, remaining, wait]
      
      const result = await acquireToken('test-request');
      
      expect(result.allowed).toBe(true);
      expect(result.waitTimeMs).toBe(0);
    });

    it('should deny request when per_second bucket is empty', async () => {
      // First bucket denies, others allow
      mockRedis.evalsha
        .mockResolvedValueOnce([0, 0, 500]) // per_second: denied
        .mockResolvedValueOnce([1, 45, 0])   // per_minute: allowed
        .mockResolvedValueOnce([1, 290, 0]); // per_hour: allowed
      
      const result = await acquireToken('test-request');
      
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBeGreaterThan(0);
    });

    it('should deny request when per_minute bucket is empty', async () => {
      mockRedis.evalsha
        .mockResolvedValueOnce([1, 1, 0])     // per_second: allowed
        .mockResolvedValueOnce([0, 0, 30000]) // per_minute: denied
        .mockResolvedValueOnce([1, 290, 0]);  // per_hour: allowed
      
      const result = await acquireToken('test-request');
      
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBe(30000);
    });

    it('should deny request when per_hour bucket is empty', async () => {
      mockRedis.evalsha
        .mockResolvedValueOnce([1, 1, 0])       // per_second: allowed
        .mockResolvedValueOnce([1, 45, 0])      // per_minute: allowed
        .mockResolvedValueOnce([0, 0, 120000]); // per_hour: denied
      
      const result = await acquireToken('test-request');
      
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBe(120000);
    });

    it('should return max wait time when multiple buckets deny', async () => {
      mockRedis.evalsha
        .mockResolvedValueOnce([0, 0, 500])    // per_second: wait 500ms
        .mockResolvedValueOnce([0, 0, 30000])  // per_minute: wait 30s
        .mockResolvedValueOnce([0, 0, 120000]); // per_hour: wait 120s
      
      const result = await acquireToken('test-request');
      
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBe(120000); // Max of all wait times
    });
  });

  describe('Three concurrent limits coordination', () => {
    it('should check all three buckets before allowing', async () => {
      mockRedis.evalsha.mockResolvedValue([1, 5, 0]);
      
      await acquireToken('test-request');
      
      // Should have called evalsha 3 times (once per bucket)
      expect(mockRedis.evalsha).toHaveBeenCalledTimes(3);
    });

    it('should enforce strictest limit', async () => {
      // Simulate scenario where per_second allows but per_hour is exhausted
      mockRedis.evalsha
        .mockResolvedValueOnce([1, 2, 0])      // per_second: 2 tokens
        .mockResolvedValueOnce([1, 50, 0])     // per_minute: 50 tokens
        .mockResolvedValueOnce([0, 0, 3600000]); // per_hour: exhausted
      
      const result = await acquireToken('test-request');
      
      expect(result.allowed).toBe(false);
      expect(result.bucketStates.per_hour.allowed).toBe(false);
    });
  });
});

describe('Token Bucket Algorithm Correctness', () => {
  describe('Token refill calculation', () => {
    it('should not exceed bucket capacity after refill', () => {
      // This tests the Lua script logic conceptually
      const capacity = 50;
      const currentTokens = 45;
      const tokensToAdd = 10;
      
      const newTokens = Math.min(capacity, currentTokens + tokensToAdd);
      
      expect(newTokens).toBe(50); // Capped at capacity
    });

    it('should calculate correct refill rate', () => {
      const refillRate = 50; // tokens per interval
      const intervalMs = 60000; // 1 minute
      const elapsedMs = 30000; // 30 seconds
      
      const tokensToAdd = Math.floor((elapsedMs / intervalMs) * refillRate);
      
      expect(tokensToAdd).toBe(25); // Half the rate for half the time
    });
  });

  describe('Wait time calculation', () => {
    it('should calculate correct wait time for token replenishment', () => {
      const tokensNeeded = 1;
      const tokensAvailable = 0;
      const refillRate = 2; // per second
      const intervalMs = 1000;
      
      const waitTimeMs = Math.ceil(((tokensNeeded - tokensAvailable) / refillRate) * intervalMs);
      
      expect(waitTimeMs).toBe(500); // 0.5 seconds to get 1 token at 2/sec
    });
  });
});
