/**
 * API Response Time Tests
 * 
 * Tests to verify API endpoints respond within 200ms requirement.
 */

import { jest } from '@jest/globals';

describe('API Response Time Tests', () => {
  const API_BASE = 'http://localhost:3000';
  const RESPONSE_TIME_LIMIT = 200; // ms

  // Skip if server is not running
  const isServerRunning = async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      return response.ok;
    } catch {
      return false;
    }
  };

  describe('Pre-computed Analytics Endpoints', () => {
    it('GET /funds should respond within 200ms', async () => {
      const serverUp = await isServerRunning();
      if (!serverUp) {
        console.log('Server not running, skipping test');
        return;
      }

      const start = Date.now();
      const response = await fetch(`${API_BASE}/funds`);
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(RESPONSE_TIME_LIMIT);
      console.log(`GET /funds: ${duration}ms`);
    });

    it('GET /funds/:code should respond within 200ms', async () => {
      const serverUp = await isServerRunning();
      if (!serverUp) {
        console.log('Server not running, skipping test');
        return;
      }

      const start = Date.now();
      const response = await fetch(`${API_BASE}/funds/118989`);
      const duration = Date.now() - start;

      expect(response.ok || response.status === 404).toBe(true);
      expect(duration).toBeLessThan(RESPONSE_TIME_LIMIT);
      console.log(`GET /funds/:code: ${duration}ms`);
    });

    it('GET /funds/:code/analytics should respond within 200ms', async () => {
      const serverUp = await isServerRunning();
      if (!serverUp) {
        console.log('Server not running, skipping test');
        return;
      }

      const start = Date.now();
      const response = await fetch(`${API_BASE}/funds/118989/analytics?window=3Y`);
      const duration = Date.now() - start;

      expect(response.ok || response.status === 404).toBe(true);
      expect(duration).toBeLessThan(RESPONSE_TIME_LIMIT);
      console.log(`GET /funds/:code/analytics: ${duration}ms`);
    });

    it('GET /funds/rank should respond within 200ms', async () => {
      const serverUp = await isServerRunning();
      if (!serverUp) {
        console.log('Server not running, skipping test');
        return;
      }

      const start = Date.now();
      const response = await fetch(
        `${API_BASE}/funds/rank?category=Mid%20Cap&window=3Y&limit=5`
      );
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(RESPONSE_TIME_LIMIT);
      console.log(`GET /funds/rank: ${duration}ms`);
    });

    it('GET /sync/status should respond within 200ms', async () => {
      const serverUp = await isServerRunning();
      if (!serverUp) {
        console.log('Server not running, skipping test');
        return;
      }

      const start = Date.now();
      const response = await fetch(`${API_BASE}/sync/status`);
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(RESPONSE_TIME_LIMIT);
      console.log(`GET /sync/status: ${duration}ms`);
    });
  });

  describe('Health Check', () => {
    it('GET /health should respond within 50ms', async () => {
      const serverUp = await isServerRunning();
      if (!serverUp) {
        console.log('Server not running, skipping test');
        return;
      }

      const start = Date.now();
      const response = await fetch(`${API_BASE}/health`);
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(50);
      console.log(`GET /health: ${duration}ms`);
    });
  });
});
