/**
 * Sync Job Orchestrator
 * 
 * Coordinates the full data pipeline:
 * 1. Scheme discovery (filter from mfapi.in)
 * 2. Backfill (fetch full NAV history)
 * 3. Incremental sync (daily updates)
 * 4. Analytics computation
 * 
 * Tracks pipeline status in the pipeline_status table.
 */

import { logger } from '../logger/index.js';
import { pipelineStatusDao, syncStateDao } from '../dao/index.js';
import { discoverSchemes } from '../services/schemeDiscovery.js';
import { backfillAllSchemes } from '../services/backfillService.js';
import { syncAllSchemes, getSchemesForSync } from '../services/incrementalSyncService.js';
import { computeAllAnalytics } from '../services/analyticsService.js';

let isRunning = false;

/**
 * Gets current pipeline status
 * 
 * @returns {Promise<Object>} Pipeline status
 */
export async function getPipelineStatus() {
  const status = await pipelineStatusDao.get();
  
  if (!status) {
    return {
      status: 'idle',
      isRunning: false,
      currentPhase: null,
      progressPercent: 0,
      totalSchemes: 0,
      completedSchemes: 0,
    };
  }

  // Get sync state counts
  const syncStates = await syncStateDao.getStatusCounts();

  return {
    status: status.status,
    isRunning: status.status === 'running',
    currentPhase: status.current_phase,
    progressPercent: status.progress_percent,
    totalSchemes: status.total_schemes,
    completedSchemes: status.completed_schemes,
    failedSchemes: status.failed_schemes,
    startedAt: status.started_at,
    completedAt: status.completed_at,
    lastError: status.last_error,
    syncStates,
  };
}

/**
 * Runs the full sync pipeline
 * 
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object>} Pipeline results
 */
export async function runFullSync(requestId) {
  if (isRunning) {
    throw new Error('Sync is already in progress');
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // Initialize pipeline status
    await pipelineStatusDao.markRunning('discovery');
    await pipelineStatusDao.updateProgress({ percent: 0 });

    logger.info('Starting scheme discovery phase', { request_id: requestId });

    // Phase 1: Discover schemes
    const schemes = await discoverSchemes(`${requestId}:discovery`);
    
    await pipelineStatusDao.updateProgress({ 
      percent: 10, 
      total: schemes.length 
    });

    // Phase 2: Backfill
    logger.info('Starting backfill phase', { 
      request_id: requestId, 
      schemes: schemes.length 
    });

    await pipelineStatusDao.update({ currentPhase: 'backfill' });
    
    const backfillResults = await backfillAllSchemes(
      schemes,
      `${requestId}:backfill`,
      (progress) => {
        const percent = 10 + (progress.current / progress.total) * 60;
        pipelineStatusDao.updateProgress({
          percent,
          completed: progress.completed,
          failed: progress.failed,
        });
      }
    );

    // Phase 3: Analytics computation
    logger.info('Starting analytics computation phase', { request_id: requestId });

    await pipelineStatusDao.update({ currentPhase: 'analytics' });
    await pipelineStatusDao.updateProgress({ percent: 70 });

    // Get schemes with completed backfill for analytics
    const schemesForAnalytics = await getSchemesForSync();
    
    const analyticsResults = await computeAllAnalytics(
      schemesForAnalytics,
      `${requestId}:analytics`,
      (progress) => {
        const percent = 70 + (progress.current / progress.total) * 30;
        pipelineStatusDao.updateProgress({ percent });
      }
    );

    // Mark pipeline as complete
    const duration = Date.now() - startTime;
    await pipelineStatusDao.markCompleted();

    logger.info('Full sync pipeline completed', {
      request_id: requestId,
      duration_ms: duration,
      results: {
        discovery: { schemesFound: schemes.length },
        backfill: backfillResults,
        incremental: null,
        analytics: analyticsResults,
      },
    });

    isRunning = false;

    return {
      discovery: { schemesFound: schemes.length },
      backfill: backfillResults,
      incremental: null,
      analytics: analyticsResults,
    };
  } catch (error) {
    isRunning = false;
    await pipelineStatusDao.markFailed(error.message);

    logger.error('Sync pipeline failed', {
      request_id: requestId,
      phase: (await getPipelineStatus()).currentPhase,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Runs incremental sync only
 * 
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Object>} Sync results
 */
export async function runIncrementalSync(requestId) {
  if (isRunning) {
    throw new Error('Sync is already in progress');
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    await pipelineStatusDao.markRunning('incremental');
    await pipelineStatusDao.updateProgress({ percent: 0 });

    // Get schemes that have been backfilled
    const schemes = await getSchemesForSync();
    
    await pipelineStatusDao.updateProgress({ total: schemes.length });

    // Run incremental sync
    const syncResults = await syncAllSchemes(
      schemes,
      `${requestId}:incremental`,
      (progress) => {
        const percent = (progress.current / progress.total) * 70;
        pipelineStatusDao.updateProgress({
          percent,
          completed: progress.synced,
          failed: progress.failed,
        });
      }
    );

    // Recompute analytics if new data was added
    let analyticsResults = null;
    if (syncResults.totalNewRecords > 0) {
      await pipelineStatusDao.update({ currentPhase: 'analytics' });
      await pipelineStatusDao.updateProgress({ percent: 70 });

      analyticsResults = await computeAllAnalytics(
        schemes,
        `${requestId}:analytics`,
        (progress) => {
          const percent = 70 + (progress.current / progress.total) * 30;
          pipelineStatusDao.updateProgress({ percent });
        }
      );
    }

    const duration = Date.now() - startTime;
    await pipelineStatusDao.markCompleted();

    logger.info('Incremental sync completed', {
      request_id: requestId,
      duration_ms: duration,
      sync: syncResults,
      analytics: analyticsResults,
    });

    isRunning = false;

    return {
      sync: syncResults,
      analytics: analyticsResults,
    };
  } catch (error) {
    isRunning = false;
    await pipelineStatusDao.markFailed(error.message);
    throw error;
  }
}

/**
 * Checks if sync is currently running
 * 
 * @returns {boolean}
 */
export function isSyncRunning() {
  return isRunning;
}
