/**
 * Admin Router
 * 
 * Administrative endpoints for database setup and management.
 * - POST /admin/migrate - Create database tables
 */

import { Router } from 'express';
import * as db from '../db/connection.js';
import { logger } from '../logger/index.js';

const router = Router();

/**
 * POST /admin/migrate
 * 
 * Creates all database tables.
 */
router.post('/migrate', async (req, res, next) => {
  try {
    logger.info('Running database migration via API');
    
    const results = [];
    
    // 1. Create funds table
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS funds (
          scheme_code VARCHAR(20) PRIMARY KEY,
          scheme_name VARCHAR(500) NOT NULL,
          amc VARCHAR(200),
          category VARCHAR(200),
          scheme_type VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_amc (amc),
          INDEX idx_category (category)
        )
      `);
      results.push({ table: 'funds', status: 'created' });
    } catch (e) {
      results.push({ table: 'funds', status: 'error', error: e.message });
    }
    
    // 2. Create nav_history table
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nav_history (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          scheme_code VARCHAR(20) NOT NULL,
          nav_date DATE NOT NULL,
          nav DECIMAL(15, 4) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_nav (scheme_code, nav_date),
          INDEX idx_scheme_date (scheme_code, nav_date),
          FOREIGN KEY (scheme_code) REFERENCES funds(scheme_code) ON DELETE CASCADE
        )
      `);
      results.push({ table: 'nav_history', status: 'created' });
    } catch (e) {
      results.push({ table: 'nav_history', status: 'error', error: e.message });
    }
    
    // 3. Create analytics table
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS analytics (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          scheme_code VARCHAR(20) NOT NULL,
          window_type ENUM('1Y', '3Y', '5Y', '10Y') NOT NULL,
          rolling_return_min DECIMAL(10, 4),
          rolling_return_max DECIMAL(10, 4),
          rolling_return_median DECIMAL(10, 4),
          rolling_return_p25 DECIMAL(10, 4),
          rolling_return_p75 DECIMAL(10, 4),
          max_drawdown DECIMAL(10, 4),
          cagr_min DECIMAL(10, 4),
          cagr_max DECIMAL(10, 4),
          cagr_median DECIMAL(10, 4),
          data_start_date DATE,
          data_end_date DATE,
          computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_analytics (scheme_code, window_type),
          INDEX idx_scheme_window (scheme_code, window_type),
          FOREIGN KEY (scheme_code) REFERENCES funds(scheme_code) ON DELETE CASCADE
        )
      `);
      results.push({ table: 'analytics', status: 'created' });
    } catch (e) {
      results.push({ table: 'analytics', status: 'error', error: e.message });
    }
    
    // 4. Create sync_state table
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_state (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          scheme_code VARCHAR(20) NOT NULL,
          sync_type ENUM('backfill', 'incremental') NOT NULL,
          status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending',
          last_synced_date DATE,
          total_records INT DEFAULT 0,
          error_message TEXT,
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_sync (scheme_code, sync_type),
          INDEX idx_sync_status (sync_type, status),
          FOREIGN KEY (scheme_code) REFERENCES funds(scheme_code) ON DELETE CASCADE
        )
      `);
      results.push({ table: 'sync_state', status: 'created' });
    } catch (e) {
      results.push({ table: 'sync_state', status: 'error', error: e.message });
    }
    
    // 5. Create pipeline_status table
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS pipeline_status (
          id INT PRIMARY KEY DEFAULT 1,
          status ENUM('idle', 'running', 'failed') DEFAULT 'idle',
          current_phase VARCHAR(50),
          progress_percent INT DEFAULT 0,
          total_schemes INT DEFAULT 0,
          completed_schemes INT DEFAULT 0,
          failed_schemes INT DEFAULT 0,
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          last_error TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      results.push({ table: 'pipeline_status', status: 'created' });
    } catch (e) {
      results.push({ table: 'pipeline_status', status: 'error', error: e.message });
    }
    
    // Get list of tables
    const tables = await db.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    logger.info('Migration completed', { tables: tableNames, results });
    
    res.json({
      success: true,
      message: 'Migration completed',
      tables: tableNames,
      details: results,
    });
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    next(error);
  }
});

/**
 * GET /admin/tables
 * 
 * Lists all tables in the database.
 */
router.get('/tables', async (req, res, next) => {
  try {
    const tables = await db.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    res.json({
      success: true,
      tables: tableNames,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
