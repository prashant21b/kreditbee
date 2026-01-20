/**
 * Funds DAO
 * 
 * Data Access Object for funds table.
 * All fund-related database queries are centralized here.
 */

import * as db from '../db/connection.js';

/**
 * Inserts or updates a fund record
 * 
 * @param {Object} fund - Fund data {schemeCode, schemeName, amc, category, schemeType}
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function upsert(fund) {
  const sql = `
    INSERT INTO funds (scheme_code, scheme_name, amc, category, scheme_type)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      scheme_name = VALUES(scheme_name),
      amc = VALUES(amc),
      category = VALUES(category),
      scheme_type = VALUES(scheme_type),
      updated_at = CURRENT_TIMESTAMP
  `;
  
  return db.execute(sql, [
    fund.schemeCode,
    fund.schemeName,
    fund.amc,
    fund.category,
    fund.schemeType || null,
  ]);
}

/**
 * Finds all funds with optional filters
 * 
 * @param {Object} filters - Optional filters {category, amc}
 * @returns {Promise<Array>} Array of fund records
 */
export async function findAll(filters = {}) {
  let sql = 'SELECT * FROM funds WHERE 1=1';
  const params = [];

  if (filters.category) {
    sql += ' AND category LIKE ?';
    params.push(`%${filters.category}%`);
  }

  if (filters.amc) {
    sql += ' AND amc LIKE ?';
    params.push(`%${filters.amc}%`);
  }

  sql += ' ORDER BY amc, category, scheme_name';
  
  return db.query(sql, params);
}

/**
 * Finds a fund by scheme code with latest NAV
 * 
 * @param {string} schemeCode - Scheme code
 * @returns {Promise<Object|null>} Fund record with latest NAV or null
 */
export async function findByCode(schemeCode) {
  const sql = `
    SELECT 
      f.*,
      nh.nav as latest_nav,
      nh.nav_date as latest_nav_date
    FROM funds f
    LEFT JOIN nav_history nh ON f.scheme_code = nh.scheme_code
      AND nh.nav_date = (
        SELECT MAX(nav_date) 
        FROM nav_history 
        WHERE scheme_code = f.scheme_code
      )
    WHERE f.scheme_code = ?
  `;
  
  return db.queryOne(sql, [schemeCode]);
}

/**
 * Finds funds with completed backfill for analytics/sync
 * 
 * @returns {Promise<Array>} Array of fund records with schemeCode, schemeName, amc, category
 */
export async function findWithCompletedBackfill() {
  const sql = `
    SELECT DISTINCT 
      f.scheme_code AS schemeCode, 
      f.scheme_name AS schemeName, 
      f.amc, 
      f.category
    FROM funds f
    INNER JOIN sync_state ss ON f.scheme_code = ss.scheme_code
    WHERE ss.sync_type = 'backfill' AND ss.status = 'completed'
  `;
  
  return db.query(sql);
}

/**
 * Ranks funds by analytics metric within a category
 * 
 * @param {Object} params - Query parameters {category, sortBy, window, limit}
 * @returns {Promise<Array>} Ranked funds
 */
export async function rankByMetric({ category, sortBy, window, limit = 5 }) {
  const sortColumnMap = {
    'median_return': 'rolling_return_median',
    'max_drawdown': 'max_drawdown',
    'cagr_median': 'cagr_median',
  };
  
  const sortColumn = sortColumnMap[sortBy] || 'rolling_return_median';
  const sortOrder = sortBy === 'max_drawdown' ? 'ASC' : 'DESC';
  
  const sql = `
    SELECT 
      f.scheme_code,
      f.scheme_name,
      f.amc,
      f.category,
      a.window_type,
      a.rolling_return_min,
      a.rolling_return_max,
      a.rolling_return_median,
      a.rolling_return_p25,
      a.rolling_return_p75,
      a.max_drawdown,
      a.cagr_min,
      a.cagr_max,
      a.cagr_median,
      nh.nav as latest_nav,
      nh.nav_date as latest_nav_date
    FROM funds f
    INNER JOIN analytics a ON f.scheme_code = a.scheme_code
    LEFT JOIN nav_history nh ON f.scheme_code = nh.scheme_code
      AND nh.nav_date = (
        SELECT MAX(nav_date) 
        FROM nav_history 
        WHERE scheme_code = f.scheme_code
      )
    WHERE f.category LIKE ?
      AND a.window_type = ?
      AND a.${sortColumn} IS NOT NULL
    ORDER BY a.${sortColumn} ${sortOrder}
    LIMIT ?
  `;
  
  return db.query(sql, [`%${category}%`, window, parseInt(limit, 10)]);
}
