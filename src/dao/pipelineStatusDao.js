/**
 * Pipeline Status DAO
 * 
 * Data Access Object for pipeline_status table.
 * Tracks overall pipeline status for monitoring.
 */

import * as db from '../db/connection.js';

/**
 * Gets current pipeline status
 * 
 * @returns {Promise<Object|null>} Pipeline status record or null
 */
export async function get() {
  return db.queryOne('SELECT * FROM pipeline_status WHERE id = 1');
}

/**
 * Updates pipeline status (upserts with id = 1)
 * 
 * @param {Object} updates - Fields to update (camelCase keys will be converted to snake_case)
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function update(updates) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    fields.push(snakeKey);
    values.push(value);
  }

  // Build upsert query
  const insertFields = fields.join(', ');
  const insertPlaceholders = values.map(() => '?').join(', ');
  const updateClauses = fields.map(f => `${f} = VALUES(${f})`).join(', ');

  const sql = `
    INSERT INTO pipeline_status (id, ${insertFields})
    VALUES (1, ${insertPlaceholders})
    ON DUPLICATE KEY UPDATE ${updateClauses}
  `;

  return db.execute(sql, values);
}

/**
 * Resets pipeline status to idle
 * 
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function reset() {
  return update({
    status: 'idle',
    currentPhase: null,
    progressPercent: 0,
    totalSchemes: 0,
    completedSchemes: 0,
    failedSchemes: 0,
    lastError: null,
  });
}

/**
 * Marks pipeline as running
 * 
 * @param {string} phase - Current phase (discovery, backfill, analytics)
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function markRunning(phase) {
  return update({
    status: 'running',
    currentPhase: phase,
    startedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    completedAt: null,
    lastError: null,
  });
}

/**
 * Marks pipeline as completed
 * 
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function markCompleted() {
  return update({
    status: 'idle',
    currentPhase: null,
    progressPercent: 100,
    completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
}

/**
 * Marks pipeline as failed
 * 
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function markFailed(errorMessage) {
  return update({
    status: 'failed',
    lastError: errorMessage,
  });
}

/**
 * Updates progress
 * 
 * @param {Object} progress - Progress data {percent, completed, failed, total}
 * @returns {Promise<Object>} Result with affectedRows
 */
export async function updateProgress({ percent, completed, failed, total }) {
  const updates = {};
  
  if (percent !== undefined) updates.progressPercent = percent;
  if (completed !== undefined) updates.completedSchemes = completed;
  if (failed !== undefined) updates.failedSchemes = failed;
  if (total !== undefined) updates.totalSchemes = total;
  
  return update(updates);
}
