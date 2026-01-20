/**
 * NAV History DAO
 * 
 * Data Access Object for nav_history table.
 * All NAV history-related database queries are centralized here.
 */

import * as db from '../db/connection.js';

/**
 * Bulk upserts NAV history records
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for idempotency
 * 
 * @param {string} schemeCode - Scheme code
 * @param {Array} navRecords - Array of {date, nav} objects
 * @returns {Promise<number>} Number of rows affected
 */
export async function bulkUpsert(schemeCode, navRecords) {
  if (!navRecords || navRecords.length === 0) {
    return 0;
  }

  const values = navRecords.map(nav => [schemeCode, nav.date, nav.nav]);
  const placeholders = values.map(() => '(?, ?, ?)').join(', ');
  const flatValues = values.flat();

  const sql = `
    INSERT INTO nav_history (scheme_code, nav_date, nav)
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE
      nav = VALUES(nav)
  `;

  const result = await db.execute(sql, flatValues);
  return result.affectedRows;
}

/**
 * Gets the latest NAV date for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<string|null>} Latest date in YYYY-MM-DD format or null
 */
export async function findLatestDate(schemeCode) {
  const sql = `
    SELECT MAX(nav_date) as latest_date
    FROM nav_history
    WHERE scheme_code = ?
  `;
  
  const result = await db.queryOne(sql, [schemeCode]);
  return result?.latest_date || null;
}

/**
 * Gets NAV history for a scheme within a date range
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of {date, nav} objects
 */
export async function findByDateRange(schemeCode, startDate, endDate) {
  const sql = `
    SELECT nav_date as date, nav
    FROM nav_history
    WHERE scheme_code = ?
      AND nav_date BETWEEN ? AND ?
    ORDER BY nav_date ASC
  `;
  
  return db.query(sql, [schemeCode, startDate, endDate]);
}

/**
 * Gets all NAV history for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<Array>} Array of {date, nav} objects sorted by date ascending
 */
export async function findAllByScheme(schemeCode) {
  const sql = `
    SELECT nav_date as date, nav
    FROM nav_history
    WHERE scheme_code = ?
    ORDER BY nav_date ASC
  `;
  
  return db.query(sql, [schemeCode]);
}

/**
 * Gets the count of NAV records for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<number>} Number of NAV records
 */
export async function countByScheme(schemeCode) {
  const sql = `
    SELECT COUNT(*) as count
    FROM nav_history
    WHERE scheme_code = ?
  `;
  
  const result = await db.queryOne(sql, [schemeCode]);
  return result?.count || 0;
}
