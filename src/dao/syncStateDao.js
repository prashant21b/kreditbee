/**
 * Sync State DAO
 * 
 * Data Access Object for sync_state table.
 * Tracks sync progress per scheme for crash-safe resume.
 */

import * as db from '../db/connection.js';

/**
 * Finds sync state for a scheme and sync type
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} syncType - Sync type ('backfill' or 'incremental')
 * @returns {Promise<Object|null>} Sync state record or null
 */
export async function findBySchemeAndType(schemeCode, syncType) {
  const sql = `
    SELECT * FROM sync_state 
    WHERE scheme_code = ? AND sync_type = ?
  `;
  
  return db.queryOne(sql, [schemeCode, syncType]);
}

/**
 * Creates a new sync state record
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} syncType - Sync type ('backfill' or 'incremental')
 * @param {string} status - Initial status (default: 'pending')
 * @returns {Promise<Object>} Result with insertId
 */
export async function create(schemeCode, syncType, status = 'pending') {
  const sql = `
    INSERT INTO sync_state (scheme_code, sync_type, status) 
    VALUES (?, ?, ?)
  `;
  
  return db.execute(sql, [schemeCode, syncType, status]);
}

/**
 * Updates sync state for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} syncType - Sync type
 * @param {Object} updates - Fields to update (camelCase keys will be converted to snake_case)
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function update(schemeCode, syncType, updates) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    fields.push(`${snakeKey} = ?`);
    values.push(value);
  }

  values.push(schemeCode, syncType);

  const sql = `
    UPDATE sync_state 
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE scheme_code = ? AND sync_type = ?
  `;

  return db.execute(sql, values);
}

/**
 * Gets sync state counts grouped by type and status
 * 
 * @returns {Promise<Array>} Array of {sync_type, status, count}
 */
export async function getStatusCounts() {
  const sql = `
    SELECT sync_type, status, COUNT(*) as count
    FROM sync_state
    GROUP BY sync_type, status
  `;
  
  return db.query(sql);
}

/**
 * Finds all sync states for a given type
 * 
 * @param {string} syncType - Sync type ('backfill' or 'incremental')
 * @returns {Promise<Array>} Array of sync state records
 */
export async function findAllByType(syncType) {
  const sql = `
    SELECT * FROM sync_state 
    WHERE sync_type = ?
    ORDER BY updated_at DESC
  `;
  
  return db.query(sql, [syncType]);
}

/**
 * Finds pending sync states for a given type
 * 
 * @param {string} syncType - Sync type
 * @returns {Promise<Array>} Array of pending sync state records
 */
export async function findPendingByType(syncType) {
  const sql = `
    SELECT * FROM sync_state 
    WHERE sync_type = ? AND status IN ('pending', 'in_progress', 'failed')
    ORDER BY updated_at ASC
  `;
  
  return db.query(sql, [syncType]);
}

/**
 * Resets all sync states for a given type
 * 
 * @param {string} syncType - Sync type
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function resetByType(syncType) {
  const sql = `
    UPDATE sync_state 
    SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE sync_type = ?
  `;
  
  return db.execute(sql, [syncType]);
}
