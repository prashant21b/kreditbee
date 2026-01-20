/**
 * MF API Client
 * 
 * HTTP client for mfapi.in with integrated rate limiting.
 * Ensures compliance with API rate limits:
 * - 2 requests/second
 * - 50 requests/minute
 * - 300 requests/hour
 * 
 * Uses axios for HTTP requests and waits for rate limiter tokens
 * before each request.
 */

import axios from 'axios';
import config from '../config/index.js';
import { logger } from '../logger/index.js';
import { waitForToken } from '../utils/rateLimiter.js';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: config.mfApi.baseUrl,
  timeout: config.mfApi.timeout,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'MutualFundAnalytics/1.0',
  },
});

/**
 * Fetches the complete list of all mutual fund schemes
 * 
 * Endpoint: GET https://api.mfapi.in/mf
 * 
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Array>} Array of scheme objects {schemeCode, schemeName}
 */
async function getAllSchemes(requestId = 'unknown') {
  const startTime = Date.now();
  
  // Wait for rate limiter token
  const tokenAcquired = await waitForToken(requestId);
  if (!tokenAcquired) {
    throw new Error('Rate limit timeout while fetching scheme list');
  }

  try {
    logger.info('Fetching all schemes from mfapi.in', { request_id: requestId });
    
    const response = await apiClient.get('');
    const duration = Date.now() - startTime;
    
    logger.info('Scheme list fetched successfully', {
      request_id: requestId,
      count: response.data.length,
      duration_ms: duration,
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to fetch scheme list', {
      request_id: requestId,
      error: error.message,
      status: error.response?.status,
    });
    throw error;
  }
}

/**
 * Fetches NAV history for a specific scheme
 * 
 * Endpoint: GET https://api.mfapi.in/mf/{scheme_code}
 * 
 * Response format:
 * {
 *   "meta": { "fund_house": "...", "scheme_type": "...", "scheme_category": "...", "scheme_code": ..., "scheme_name": "..." },
 *   "data": [{ "date": "DD-MM-YYYY", "nav": "123.4567" }, ...]
 * }
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object>} Scheme data with meta and NAV history
 */
async function getSchemeData(schemeCode, requestId = 'unknown') {
  const startTime = Date.now();
  
  // Wait for rate limiter token
  const tokenAcquired = await waitForToken(requestId);
  if (!tokenAcquired) {
    throw new Error(`Rate limit timeout while fetching scheme ${schemeCode}`);
  }

  try {
    logger.info('Fetching scheme data from mfapi.in', {
      request_id: requestId,
      scheme_code: schemeCode,
    });

    const response = await apiClient.get(`/${schemeCode}`);
    const duration = Date.now() - startTime;

    const navCount = response.data.data?.length || 0;
    
    logger.info('Scheme data fetched successfully', {
      request_id: requestId,
      scheme_code: schemeCode,
      scheme_name: response.data.meta?.scheme_name,
      nav_records: navCount,
      duration_ms: duration,
    });

    return response.data;
  } catch (error) {
    // Handle 429 Too Many Requests specifically
    if (error.response?.status === 429) {
      logger.error('Rate limit exceeded (HTTP 429) - HARD FAILURE', {
        request_id: requestId,
        scheme_code: schemeCode,
        error: error.message,
      });
      throw new Error(`Rate limit exceeded for scheme ${schemeCode}. This should not happen with proper rate limiting.`);
    }

    logger.error('Failed to fetch scheme data', {
      request_id: requestId,
      scheme_code: schemeCode,
      error: error.message,
      status: error.response?.status,
    });
    throw error;
  }
}

/**
 * Parses NAV date from API format (DD-MM-YYYY) to ISO format (YYYY-MM-DD)
 * 
 * @param {string} dateStr - Date in DD-MM-YYYY format
 * @returns {string} Date in YYYY-MM-DD format
 */
function parseNavDate(dateStr) {
  const [day, month, year] = dateStr.split('-');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes scheme data from API response
 * 
 * @param {Object} apiResponse - Raw API response
 * @returns {Object} Normalized data {meta, navHistory}
 */
function normalizeSchemeData(apiResponse) {
  const { meta, data } = apiResponse;
  
  // Normalize metadata
  const normalizedMeta = {
    schemeCode: String(meta.scheme_code),
    schemeName: meta.scheme_name,
    amc: meta.fund_house,
    category: meta.scheme_category,
    schemeType: meta.scheme_type,
  };

  // Normalize NAV history
  // API returns data in reverse chronological order (newest first)
  const navHistory = (data || []).map(item => ({
    date: parseNavDate(item.date),
    nav: parseFloat(item.nav),
  })).sort((a, b) => a.date.localeCompare(b.date)); // Sort oldest to newest

  return {
    meta: normalizedMeta,
    navHistory,
  };
}

export {
  getAllSchemes,
  getSchemeData,
  normalizeSchemeData,
  parseNavDate,
};
