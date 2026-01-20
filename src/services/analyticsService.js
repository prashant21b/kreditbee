/**
 * Analytics Service
 * 
 * Computes analytics for mutual funds:
 * - Rolling returns (min, max, median, p25, p75)
 * - Max drawdown
 * - CAGR distribution
 * 
 * Handles:
 * - Missing NAV days (weekends/holidays)
 * - Schemes with insufficient history
 */

import { logger } from '../logger/index.js';
import * as fundService from './fundService.js';
import config from '../config/index.js';

/**
 * Calculates percentile from a sorted array
 * Uses linear interpolation for accurate percentile calculation
 * 
 * @param {Array} sortedArray - Sorted array of numbers
 * @param {number} percentile - Percentile (0-100)
 * @returns {number} Percentile value
 */
function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return null;
  if (sortedArray.length === 1) return sortedArray[0];
  
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  
  if (lower === upper) return sortedArray[lower];
  
  return sortedArray[lower] * (1 - fraction) + sortedArray[upper] * fraction;
}

/**
 * Calculates median (50th percentile)
 * 
 * @param {Array} array - Array of numbers
 * @returns {number} Median value
 */
function calculateMedian(array) {
  if (array.length === 0) return null;
  const sorted = [...array].sort((a, b) => a - b);
  return calculatePercentile(sorted, 50);
}

/**
 * Calculates CAGR (Compound Annual Growth Rate)
 * 
 * Formula: CAGR = (Ending Value / Beginning Value)^(1/Years) - 1
 * 
 * @param {number} startNav - Starting NAV
 * @param {number} endNav - Ending NAV
 * @param {number} years - Number of years
 * @returns {number} CAGR as decimal (e.g., 0.12 for 12%)
 */
function calculateCAGR(startNav, endNav, years) {
  if (startNav <= 0 || years <= 0) return null;
  return Math.pow(endNav / startNav, 1 / years) - 1;
}

/**
 * Calculates simple return
 * 
 * @param {number} startNav - Starting NAV
 * @param {number} endNav - Ending NAV
 * @returns {number} Return as decimal
 */
function calculateReturn(startNav, endNav) {
  if (startNav <= 0) return null;
  return (endNav - startNav) / startNav;
}

/**
 * Calculates maximum drawdown from a series of NAV values
 * 
 * Max Drawdown = Maximum peak-to-trough decline
 * 
 * @param {Array} navHistory - Array of {date, nav} objects (sorted by date)
 * @returns {number} Max drawdown as decimal (negative value)
 */
function calculateMaxDrawdown(navHistory) {
  if (navHistory.length < 2) return null;
  
  let peak = navHistory[0].nav;
  let maxDrawdown = 0;
  
  for (const { nav } of navHistory) {
    if (nav > peak) {
      peak = nav;
    }
    
    const drawdown = (nav - peak) / peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return maxDrawdown;
}

/**
 * Calculates rolling returns for a given window
 * 
 * For each day, calculates the return from windowDays ago to that day.
 * 
 * @param {Array} navHistory - Array of {date, nav} objects (sorted by date)
 * @param {number} windowDays - Window size in days
 * @returns {Array} Array of rolling returns
 */
function calculateRollingReturns(navHistory, windowDays) {
  const returns = [];
  
  // Create a date-indexed map for efficient lookups
  const navByDate = new Map();
  for (const nav of navHistory) {
    navByDate.set(nav.date, nav.nav);
  }
  
  // For each day, find the NAV windowDays ago and calculate return
  for (let i = 0; i < navHistory.length; i++) {
    const currentDate = new Date(navHistory[i].date);
    const pastDate = new Date(currentDate);
    pastDate.setDate(pastDate.getDate() - windowDays);
    
    // Find the closest past date with NAV data (within 5 days tolerance)
    let pastNav = null;
    for (let offset = 0; offset <= 5; offset++) {
      const checkDate = new Date(pastDate);
      checkDate.setDate(checkDate.getDate() + offset);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      if (navByDate.has(dateStr)) {
        pastNav = navByDate.get(dateStr);
        break;
      }
    }
    
    if (pastNav !== null) {
      const returnValue = calculateReturn(pastNav, navHistory[i].nav);
      if (returnValue !== null) {
        returns.push(returnValue);
      }
    }
  }
  
  return returns;
}

/**
 * Calculates rolling CAGRs for a given window
 * 
 * @param {Array} navHistory - Array of {date, nav} objects
 * @param {number} windowYears - Window size in years
 * @returns {Array} Array of rolling CAGRs
 */
function calculateRollingCAGRs(navHistory, windowYears) {
  const windowDays = windowYears * 365;
  const cagrs = [];
  
  const navByDate = new Map();
  for (const nav of navHistory) {
    navByDate.set(nav.date, nav.nav);
  }
  
  for (let i = 0; i < navHistory.length; i++) {
    const currentDate = new Date(navHistory[i].date);
    const pastDate = new Date(currentDate);
    pastDate.setDate(pastDate.getDate() - windowDays);
    
    // Find closest past date with NAV
    let pastNav = null;
    for (let offset = 0; offset <= 5; offset++) {
      const checkDate = new Date(pastDate);
      checkDate.setDate(checkDate.getDate() + offset);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      if (navByDate.has(dateStr)) {
        pastNav = navByDate.get(dateStr);
        break;
      }
    }
    
    if (pastNav !== null) {
      const cagr = calculateCAGR(pastNav, navHistory[i].nav, windowYears);
      if (cagr !== null) {
        cagrs.push(cagr);
      }
    }
  }
  
  return cagrs;
}

/**
 * Computes analytics for a scheme for a specific window
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} windowType - Window type (1Y, 3Y, 5Y, 10Y)
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object|null>} Analytics object or null if insufficient data
 */
async function computeSchemeAnalytics(schemeCode, windowType, requestId) {
  const startTime = Date.now();
  
  // Get window in days and years
  const windowDays = config.windowToDays[windowType];
  const windowYears = parseInt(windowType.replace('Y', ''), 10);
  
  // Get all NAV history
  const navHistory = await fundService.getAllNavHistory(schemeCode);
  
  if (!navHistory || navHistory.length === 0) {
    logger.warn('No NAV history for scheme', {
      request_id: requestId,
      scheme_code: schemeCode,
      window: windowType,
    });
    return null;
  }
  
  // Check if we have enough history
  const firstDate = new Date(navHistory[0].date);
  const lastDate = new Date(navHistory[navHistory.length - 1].date);
  const historyDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
  
  if (historyDays < windowDays * 0.9) { // Require at least 90% of window
    logger.info('Insufficient history for window', {
      request_id: requestId,
      scheme_code: schemeCode,
      window: windowType,
      history_days: Math.round(historyDays),
      required_days: windowDays,
    });
    return null;
  }
  
  // Calculate rolling returns
  const rollingReturns = calculateRollingReturns(navHistory, windowDays);
  
  if (rollingReturns.length === 0) {
    logger.warn('No rolling returns calculated', {
      request_id: requestId,
      scheme_code: schemeCode,
      window: windowType,
    });
    return null;
  }
  
  // Sort returns for percentile calculations
  const sortedReturns = [...rollingReturns].sort((a, b) => a - b);
  
  // Calculate rolling CAGRs
  const rollingCAGRs = calculateRollingCAGRs(navHistory, windowYears);
  const sortedCAGRs = [...rollingCAGRs].sort((a, b) => a - b);
  
  // Calculate max drawdown (on full history up to window end)
  const maxDrawdown = calculateMaxDrawdown(navHistory);
  
  const analytics = {
    rollingReturnMin: sortedReturns[0],
    rollingReturnMax: sortedReturns[sortedReturns.length - 1],
    rollingReturnMedian: calculatePercentile(sortedReturns, 50),
    rollingReturnP25: calculatePercentile(sortedReturns, 25),
    rollingReturnP75: calculatePercentile(sortedReturns, 75),
    maxDrawdown: maxDrawdown,
    cagrMin: sortedCAGRs.length > 0 ? sortedCAGRs[0] : null,
    cagrMax: sortedCAGRs.length > 0 ? sortedCAGRs[sortedCAGRs.length - 1] : null,
    cagrMedian: sortedCAGRs.length > 0 ? calculatePercentile(sortedCAGRs, 50) : null,
    dataStartDate: navHistory[0].date,
    dataEndDate: navHistory[navHistory.length - 1].date,
  };
  
  const duration = Date.now() - startTime;
  
  logger.info('Analytics computed for scheme', {
    request_id: requestId,
    scheme_code: schemeCode,
    window: windowType,
    rolling_returns_count: rollingReturns.length,
    cagrs_count: rollingCAGRs.length,
    computation_time_ms: duration,
  });
  
  return analytics;
}

/**
 * Computes and saves analytics for a scheme across all windows
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object>} Results per window
 */
async function computeAllWindowsForScheme(schemeCode, requestId) {
  const results = {};
  
  for (const windowType of config.analyticsWindows) {
    const analytics = await computeSchemeAnalytics(schemeCode, windowType, requestId);
    
    if (analytics) {
      // Save to database
      await fundService.upsertAnalytics(schemeCode, windowType, analytics);
      results[windowType] = { computed: true, analytics };
    } else {
      results[windowType] = { computed: false, reason: 'insufficient_data' };
    }
  }
  
  return results;
}

/**
 * Computes analytics for all schemes
 * 
 * @param {Array} schemes - Array of scheme objects
 * @param {string} requestId - Request ID for tracing
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Summary of computation results
 */
async function computeAllAnalytics(schemes, requestId, progressCallback = null) {
  const startTime = Date.now();
  const results = {
    total: schemes.length,
    computed: 0,
    skipped: 0,
    byWindow: {},
  };
  
  // Initialize window counters
  for (const window of config.analyticsWindows) {
    results.byWindow[window] = { computed: 0, skipped: 0 };
  }
  
  logger.info('Starting analytics computation for all schemes', {
    request_id: requestId,
    total_schemes: schemes.length,
    windows: config.analyticsWindows,
  });
  
  for (let i = 0; i < schemes.length; i++) {
    const scheme = schemes[i];
    
    try {
      const schemeResults = await computeAllWindowsForScheme(
        scheme.schemeCode,
        `${requestId}:${i}`
      );
      
      let anyComputed = false;
      for (const [window, result] of Object.entries(schemeResults)) {
        if (result.computed) {
          results.byWindow[window].computed++;
          anyComputed = true;
        } else {
          results.byWindow[window].skipped++;
        }
      }
      
      if (anyComputed) {
        results.computed++;
      } else {
        results.skipped++;
      }
    } catch (error) {
      logger.error('Analytics computation failed for scheme', {
        request_id: requestId,
        scheme_code: scheme.schemeCode,
        error: error.message,
      });
      results.skipped++;
    }
    
    // Progress callback
    if (progressCallback) {
      progressCallback({
        current: i + 1,
        total: schemes.length,
        computed: results.computed,
        skipped: results.skipped,
      });
    }
  }
  
  const duration = Date.now() - startTime;
  
  logger.info('Analytics computation completed', {
    request_id: requestId,
    total: results.total,
    computed: results.computed,
    skipped: results.skipped,
    by_window: results.byWindow,
    duration_ms: duration,
  });
  
  return results;
}

export {
  computeSchemeAnalytics,
  computeAllWindowsForScheme,
  computeAllAnalytics,
  calculatePercentile,
  calculateMedian,
  calculateCAGR,
  calculateReturn,
  calculateMaxDrawdown,
  calculateRollingReturns,
};
