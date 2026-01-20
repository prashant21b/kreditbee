/**
 * Analytics DAO
 * 
 * Data Access Object for analytics table.
 * All analytics-related database queries are centralized here.
 */

import * as db from '../db/connection.js';

/**
 * Helper to convert undefined to null (MySQL doesn't accept undefined)
 */
const toNull = (val) => (val === undefined ? null : val);

/**
 * Inserts or updates analytics for a scheme and window
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} windowType - Window type (1Y, 3Y, 5Y, 10Y)
 * @param {Object} analytics - Analytics data
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function upsert(schemeCode, windowType, analytics) {
  const sql = `
    INSERT INTO analytics (
      scheme_code, window_type,
      rolling_return_min, rolling_return_max, rolling_return_median,
      rolling_return_p25, rolling_return_p75,
      max_drawdown,
      cagr_min, cagr_max, cagr_median,
      data_start_date, data_end_date,
      computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      rolling_return_min = VALUES(rolling_return_min),
      rolling_return_max = VALUES(rolling_return_max),
      rolling_return_median = VALUES(rolling_return_median),
      rolling_return_p25 = VALUES(rolling_return_p25),
      rolling_return_p75 = VALUES(rolling_return_p75),
      max_drawdown = VALUES(max_drawdown),
      cagr_min = VALUES(cagr_min),
      cagr_max = VALUES(cagr_max),
      cagr_median = VALUES(cagr_median),
      data_start_date = VALUES(data_start_date),
      data_end_date = VALUES(data_end_date),
      computed_at = CURRENT_TIMESTAMP
  `;
  
  return db.execute(sql, [
    schemeCode,
    windowType,
    toNull(analytics.rollingReturnMin),
    toNull(analytics.rollingReturnMax),
    toNull(analytics.rollingReturnMedian),
    toNull(analytics.rollingReturnP25),
    toNull(analytics.rollingReturnP75),
    toNull(analytics.maxDrawdown),
    toNull(analytics.cagrMin),
    toNull(analytics.cagrMax),
    toNull(analytics.cagrMedian),
    toNull(analytics.dataStartDate),
    toNull(analytics.dataEndDate),
  ]);
}

/**
 * Finds analytics for a scheme by window type
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} windowType - Window type (1Y, 3Y, 5Y, 10Y)
 * @returns {Promise<Object|null>} Analytics record or null
 */
export async function findBySchemeAndWindow(schemeCode, windowType) {
  const sql = `
    SELECT * FROM analytics
    WHERE scheme_code = ? AND window_type = ?
  `;
  
  return db.queryOne(sql, [schemeCode, windowType]);
}

/**
 * Finds all analytics for a scheme (all windows)
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<Array>} Array of analytics records
 */
export async function findAllByScheme(schemeCode) {
  const sql = `
    SELECT * FROM analytics
    WHERE scheme_code = ?
    ORDER BY FIELD(window_type, '1Y', '3Y', '5Y', '10Y')
  `;
  
  return db.query(sql, [schemeCode]);
}

/**
 * Deletes all analytics for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function deleteByScheme(schemeCode) {
  const sql = 'DELETE FROM analytics WHERE scheme_code = ?';
  return db.execute(sql, [schemeCode]);
}
