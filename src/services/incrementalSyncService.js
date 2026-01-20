/**
 * Incremental Sync Service
 * 
 * Daily NAV updates - fetches only missing dates since last sync.
 * Lightweight compared to backfill, designed for scheduled daily runs.
 */

import { logger } from '../logger/index.js';
import { fundsDao } from '../dao/index.js';
import * as mfApiClient from './mfApiClient.js';
import * as fundService from './fundService.js';
import * as backfillService from './backfillService.js';

/**
 * Performs incremental sync for a single scheme
 * Only fetches NAV data newer than last synced date
 * 
 * @param {string} schemeCode - Scheme code
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object>} Sync result
 */
export async function syncScheme(schemeCode, requestId) {
  const startTime = Date.now();

  logger.info('Starting incremental sync for scheme', {
    request_id: requestId,
    scheme_code: schemeCode,
  });

  try {
    // Get last synced date
    const lastSyncedDate = await fundService.getLatestNavDate(schemeCode);
    
    // Update sync state to in_progress
    await backfillService.updateSyncState(schemeCode, 'incremental', {
      status: 'in_progress',
      startedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      errorMessage: null,
    });

    // Fetch fresh data from API
    const apiData = await mfApiClient.getSchemeData(schemeCode, requestId);
    const { navHistory } = mfApiClient.normalizeSchemeData(apiData);

    // Filter to only new NAV records
    let newNavRecords = navHistory;
    if (lastSyncedDate) {
      newNavRecords = navHistory.filter(nav => nav.date > lastSyncedDate);
    }

    // Insert new records
    let recordsInserted = 0;
    if (newNavRecords.length > 0) {
      recordsInserted = await fundService.upsertNavHistory(schemeCode, newNavRecords);
    }

    // Get new latest date
    const newLatestDate = newNavRecords.length > 0 
      ? newNavRecords[newNavRecords.length - 1].date 
      : lastSyncedDate;

    // Update sync state
    await backfillService.updateSyncState(schemeCode, 'incremental', {
      status: 'completed',
      lastSyncedDate: newLatestDate,
      totalRecords: await fundService.getNavCount(schemeCode),
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    const duration = Date.now() - startTime;

    logger.info('Incremental sync completed for scheme', {
      request_id: requestId,
      scheme_code: schemeCode,
      new_records: newNavRecords.length,
      records_inserted: recordsInserted,
      last_date: newLatestDate,
      duration_ms: duration,
    });

    return {
      success: true,
      schemeCode,
      newRecords: newNavRecords.length,
      recordsInserted,
    };
  } catch (error) {
    // Update sync state to failed
    await backfillService.updateSyncState(schemeCode, 'incremental', {
      status: 'failed',
      errorMessage: error.message,
    });

    logger.error('Incremental sync failed for scheme', {
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
 * Performs incremental sync for all schemes
 * 
 * @param {Array} schemes - Array of scheme objects
 * @param {string} requestId - Request ID for tracing
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Summary of sync results
 */
export async function syncAllSchemes(schemes, requestId, progressCallback = null) {
  const startTime = Date.now();
  const results = {
    total: schemes.length,
    synced: 0,
    failed: 0,
    totalNewRecords: 0,
    errors: [],
  };

  logger.info('Starting incremental sync for all schemes', {
    request_id: requestId,
    total_schemes: schemes.length,
  });

  for (let i = 0; i < schemes.length; i++) {
    const scheme = schemes[i];
    
    // Ensure sync state exists
    await backfillService.getSyncState(scheme.schemeCode, 'incremental');
    
    // Sync scheme
    const result = await syncScheme(scheme.schemeCode, `${requestId}:${i}`);
    
    if (result.success) {
      results.synced++;
      results.totalNewRecords += result.newRecords;
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
        synced: results.synced,
        failed: results.failed,
      });
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Incremental sync completed for all schemes', {
    request_id: requestId,
    total: results.total,
    synced: results.synced,
    failed: results.failed,
    new_records: results.totalNewRecords,
    duration_ms: duration,
  });

  return results;
}

/**
 * Gets schemes that need incremental sync
 * (all schemes that have been backfilled)
 * 
 * @returns {Promise<Array>} Schemes ready for incremental sync
 */
export async function getSchemesForSync() {
  return fundsDao.findWithCompletedBackfill();
}
