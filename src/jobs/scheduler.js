/**
 * Scheduler
 * 
 * Uses node-cron to schedule automated data syncs.
 * Default schedule: 6:00 AM IST daily
 * 
 * Runs incremental sync to fetch only new NAV data.
 */

import cron from 'node-cron';
import config from '../config/index.js';
import { logger } from '../logger/index.js';
import { runIncrementalSync } from './syncJob.js';
import { v4 as uuidv4 } from 'uuid';

let scheduledTask = null;

/**
 * Starts the scheduler
 */
function start() {
  if (scheduledTask) {
    logger.warn('Scheduler is already running');
    return;
  }

  const schedule = config.scheduler.syncCronSchedule;

  logger.info('Starting scheduler', { schedule });

  scheduledTask = cron.schedule(
    schedule,
    async () => {
      const requestId = `scheduled-${uuidv4().slice(0, 8)}`;
      
      logger.info('Scheduled sync starting', { request_id: requestId });

      try {
        await runIncrementalSync(requestId);
        logger.info('Scheduled sync completed successfully', { request_id: requestId });
      } catch (error) {
        logger.error('Scheduled sync failed', {
          request_id: requestId,
          error: error.message,
        });
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );

  logger.info('Scheduler started', {
    schedule,
    timezone: 'Asia/Kolkata',
  });
}

/**
 * Stops the scheduler
 */
function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

/**
 * Gets scheduler status
 * 
 * @returns {Object} Scheduler status
 */
function getStatus() {
  return {
    running: scheduledTask !== null,
    schedule: config.scheduler.syncCronSchedule,
    timezone: 'Asia/Kolkata',
  };
}

export default {
  start,
  stop,
  getStatus,
};
