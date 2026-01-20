/**
 * Sync Router
 * 
 * Handles sync pipeline API endpoints:
 * - POST /sync/trigger - Trigger data ingestion
 * - GET /sync/status - Get pipeline status
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger/index.js';
import { 
  runFullSync, 
  runIncrementalSync, 
  getPipelineStatus,
  isSyncRunning,
} from '../jobs/syncJob.js';
import scheduler from '../jobs/scheduler.js';
import { getStatus as getRateLimiterStatus } from '../utils/rateLimiter.js';

const router = Router();

/**
 * POST /sync/trigger
 * 
 * Triggers data ingestion pipeline.
 * 
 * Query params:
 * - mode: 'full' (default) or 'incremental'
 * 
 * Full sync: Discovery → Backfill → Analytics
 * Incremental: Fetch new NAVs → Analytics
 */
router.post('/trigger', async (req, res, next) => {
  try {
    const mode = req.query.mode || 'full';
    const requestId = `manual-${uuidv4().slice(0, 8)}`;

    // Check if already running
    if (isSyncRunning()) {
      return res.status(409).json({
        success: false,
        error: 'Sync is already in progress',
      });
    }

    logger.info('Manual sync triggered', {
      request_id: requestId,
      mode,
    });

    // Start sync in background (don't await)
    if (mode === 'full') {
      runFullSync(requestId).catch(error => {
        logger.error('Full sync failed', {
          request_id: requestId,
          error: error.message,
        });
      });
    } else if (mode === 'incremental') {
      runIncrementalSync(requestId).catch(error => {
        logger.error('Incremental sync failed', {
          request_id: requestId,
          error: error.message,
        });
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode. Must be "full" or "incremental"',
      });
    }

    // Return immediately with 202 Accepted
    res.status(202).json({
      success: true,
      message: 'Sync started',
      request_id: requestId,
      mode,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sync/status
 * 
 * Gets current pipeline status and health information.
 */
router.get('/status', async (req, res, next) => {
  try {
    req.logger.info('Fetching sync status');

    const pipelineStatus = await getPipelineStatus();
    const schedulerStatus = scheduler.getStatus();
    const rateLimiterStatus = await getRateLimiterStatus();

    res.json({
      success: true,
      data: {
        pipeline: pipelineStatus,
        scheduler: schedulerStatus,
        rateLimiter: rateLimiterStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
