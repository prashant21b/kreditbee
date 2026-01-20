/**
 * Backfill Service
 * 
 * Fetches full NAV history (up to 10 years) for each scheme.
 * Features:
 * - Progress persistence per scheme in sync_state
 * - Resume safely after crash
 * - Idempotent inserts
 * - Rate limit compliance
 */

import { logger } from '../logger/index.js';
import { syncStateDao, fundsDao } from '../dao/index.js';
import * as mfApiClient from './mfApiClient.js';
import * as fundService from './fundService.js';

/**
 * Gets or creates sync state for a scheme
 * Note: Requires the fund to exist first due to foreign key constraint
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} syncType - Sync type (backfill or incremental)
 * @param {Object} schemeInfo - Optional scheme info to create fund if needed
 * @returns {Promise<Object>} Sync state object
 */
export async function getSyncState(schemeCode, syncType = 'backfill', schemeInfo = null) {
  let state = await syncStateDao.findBySchemeAndType(schemeCode, syncType);

  if (!state) {
    // Ensure fund exists first (required for foreign key)
    if (schemeInfo) {
      await fundsDao.upsert({
        schemeCode: schemeInfo.schemeCode,
        schemeName: schemeInfo.schemeName,
        amc: schemeInfo.amc,
        category: schemeInfo.category,
        schemeType: schemeInfo.schemeType || null,
      });
    }
    
    await syncStateDao.create(schemeCode, syncType, 'pending');
    state = await syncStateDao.findBySchemeAndType(schemeCode, syncType);
  }

  return state;
}

/**
 * Updates sync state for a scheme
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} syncType - Sync type
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateSyncState(schemeCode, syncType, updates) {
  return syncStateDao.update(schemeCode, syncType, updates);
}

/**
 * Backfills NAV history for a single scheme
 * 
 * @param {Object} scheme - Scheme object {schemeCode, schemeName, amc, category}
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object>} Result {success, recordsInserted, error}
 */
export async function backfillScheme(scheme, requestId) {
  const { schemeCode, schemeName, amc, category } = scheme;
  const startTime = Date.now();

  logger.info('Starting backfill for scheme', {
    request_id: requestId,
    scheme_code: schemeCode,
    scheme_name: schemeName,
  });

  try {
    // Update sync state to in_progress
    await updateSyncState(schemeCode, 'backfill', {
      status: 'in_progress',
      startedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      errorMessage: null,
    });

    // Fetch scheme data from API
    const apiData = await mfApiClient.getSchemeData(schemeCode, requestId);
    const { meta, navHistory } = mfApiClient.normalizeSchemeData(apiData);

    // Upsert fund metadata
    await fundService.upsertFund({
      schemeCode,
      schemeName: meta.schemeName,
      amc: amc || meta.amc,
      category: category || meta.category,
      schemeType: meta.schemeType,
    });

    // Upsert NAV history
    const recordsInserted = await fundService.upsertNavHistory(schemeCode, navHistory);

    // Get date range
    const startDate = navHistory.length > 0 ? navHistory[0].date : null;
    const endDate = navHistory.length > 0 ? navHistory[navHistory.length - 1].date : null;

    // Update sync state to completed
    await updateSyncState(schemeCode, 'backfill', {
      status: 'completed',
      lastSyncedDate: endDate,
      totalRecords: navHistory.length,
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    const duration = Date.now() - startTime;

    logger.info('Backfill completed for scheme', {
      request_id: requestId,
      scheme_code: schemeCode,
      records_inserted: recordsInserted,
      nav_count: navHistory.length,
      date_range: { start: startDate, end: endDate },
      duration_ms: duration,
    });

    return {
      success: true,
      schemeCode,
      recordsInserted,
      dateRange: { start: startDate, end: endDate },
    };
  } catch (error) {
    // Update sync state to failed
    await updateSyncState(schemeCode, 'backfill', {
      status: 'failed',
      errorMessage: error.message,
    });

    logger.error('Backfill failed for scheme', {
      request_id: requestId,
      scheme_code: schemeCode,
      error: error.message,
    });

    return {
      success: false,
      schemeCode,
      error: error.message,
    };
  }
}

/**
 * Backfills all discovered schemes
 * Resumes from where it left off if interrupted
 * 
 * @param {Array} schemes - Array of scheme objects
 * @param {string} requestId - Request ID for tracing
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Object>} Summary of backfill results
 */
export async function backfillAllSchemes(schemes, requestId, progressCallback = null) {
  const startTime = Date.now();
  const results = {
    total: schemes.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  logger.info('Starting backfill for all schemes', {
    request_id: requestId,
    total_schemes: schemes.length,
  });

  for (let i = 0; i < schemes.length; i++) {
    const scheme = schemes[i];
    
    // Check existing sync state (pass scheme info to create fund if needed)
    const syncState = await getSyncState(scheme.schemeCode, 'backfill', scheme);
    
    // Skip if already completed
    if (syncState.status === 'completed') {
      results.skipped++;
      logger.info('Skipping already completed scheme', {
        request_id: requestId,
        scheme_code: scheme.schemeCode,
      });
      continue;
    }

    // Process scheme
    const result = await backfillScheme(scheme, `${requestId}:${i}`);
    
    if (result.success) {
      results.completed++;
    } else {
      results.failed++;
      results.errors.push({
        schemeCode: scheme.schemeCode,
        error: result.error,
      });
    }

    // Progress callback
    if (progressCallback) {
      progressCallback({
        current: i + 1,
        total: schemes.length,
        completed: results.completed,
        failed: results.failed,
        skipped: results.skipped,
      });
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Backfill completed for all schemes', {
    request_id: requestId,
    total: results.total,
    completed: results.completed,
    failed: results.failed,
    skipped: results.skipped,
    duration_ms: duration,
  });

  return results;
}

/**
 * Gets pending schemes for backfill
 * 
 * @param {Array} schemes - Array of scheme objects
 * @returns {Promise<Array>} Schemes that need backfill
 */
export async function getPendingSchemes(schemes) {
  const pending = [];

  for (const scheme of schemes) {
    const syncState = await getSyncState(scheme.schemeCode, 'backfill');
    if (syncState.status !== 'completed') {
      pending.push(scheme);
    }
  }

  return pending;
}
