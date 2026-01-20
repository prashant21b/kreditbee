/**
 * Fund Service
 * 
 * Business logic for mutual fund operations.
 * Uses DAO layer for database access.
 */

import { fundsDao, navHistoryDao, analyticsDao } from '../dao/index.js';

/**
 * Upserts a fund record (insert or update on duplicate)
 * 
 * @param {Object} fund - Fund metadata
 * @returns {Promise<void>}
 */
export async function upsertFund(fund) {
  return fundsDao.upsert(fund);
}

/**
 * Bulk upserts NAV history records
 * 
 * @param {string} schemeCode - Scheme code
 * @param {Array} navHistory - Array of {date, nav} objects
 * @returns {Promise<number>} Number of rows affected
 */
export async function upsertNavHistory(schemeCode, navHistory) {
  return navHistoryDao.bulkUpsert(schemeCode, navHistory);
}

/**
 * Gets the latest synced date for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<string|null>} Latest date in YYYY-MM-DD format or null
 */
export async function getLatestNavDate(schemeCode) {
  return navHistoryDao.findLatestDate(schemeCode);
}

/**
 * Gets NAV history for a scheme within a date range
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of {date, nav} objects
 */
export async function getNavHistory(schemeCode, startDate, endDate) {
  return navHistoryDao.findByDateRange(schemeCode, startDate, endDate);
}

/**
 * Gets all NAV history for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<Array>} Array of {date, nav} objects
 */
export async function getAllNavHistory(schemeCode) {
  return navHistoryDao.findAllByScheme(schemeCode);
}

/**
 * Gets all funds with optional filters
 * 
 * @param {Object} filters - Optional filters {category, amc}
 * @returns {Promise<Array>} Array of fund objects
 */
export async function getFunds(filters = {}) {
  return fundsDao.findAll(filters);
}

/**
 * Gets a single fund by scheme code with latest NAV
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<Object|null>} Fund with latest NAV or null
 */
export async function getFundByCode(schemeCode) {
  return fundsDao.findByCode(schemeCode);
}

/**
 * Saves or updates analytics for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} windowType - Window type (1Y, 3Y, 5Y, 10Y)
 * @param {Object} analytics - Analytics data
 * @returns {Promise<void>}
 */
export async function upsertAnalytics(schemeCode, windowType, analytics) {
  return analyticsDao.upsert(schemeCode, windowType, analytics);
}

/**
 * Gets analytics for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} windowType - Optional window type filter
 * @returns {Promise<Object|Array>} Analytics object or array
 */
export async function getAnalytics(schemeCode, windowType = null) {
  if (windowType) {
    return analyticsDao.findBySchemeAndWindow(schemeCode, windowType);
  }
  return analyticsDao.findAllByScheme(schemeCode);
}

/**
 * Ranks funds by a metric within a category
 * 
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Ranked funds
 */
export async function rankFunds({ category, sortBy, window, limit = 5 }) {
  return fundsDao.rankByMetric({ category, sortBy, window, limit });
}

/**
 * Gets NAV count for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<number>} Number of NAV records
 */
export async function getNavCount(schemeCode) {
  return navHistoryDao.countByScheme(schemeCode);
}
