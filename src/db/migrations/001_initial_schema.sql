-- Initial Schema for Mutual Fund Analytics
-- Run with: npm run migrate

-- ============================================
-- Table: funds
-- Stores mutual fund scheme metadata
-- ============================================
CREATE TABLE IF NOT EXISTS funds (
  scheme_code VARCHAR(20) PRIMARY KEY,
  scheme_name VARCHAR(255) NOT NULL,
  amc VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  scheme_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for query optimization
  INDEX idx_amc (amc),
  INDEX idx_category (category),
  INDEX idx_amc_category (amc, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: nav_history
-- Time-series NAV data with optimized indexes
-- 
-- Design choices:
-- 1. Composite UNIQUE key on (scheme_code, nav_date) for idempotent inserts
-- 2. Composite INDEX for fast range queries on NAV data
-- 3. DECIMAL(15,4) for NAV to handle precision requirements
-- ============================================
CREATE TABLE IF NOT EXISTS nav_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scheme_code VARCHAR(20) NOT NULL,
  nav_date DATE NOT NULL,
  nav DECIMAL(15,4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensures no duplicate NAV entries per scheme per date
  -- Also enables idempotent inserts with ON DUPLICATE KEY UPDATE
  UNIQUE KEY uk_scheme_date (scheme_code, nav_date),
  
  -- Optimized for range queries: SELECT * WHERE scheme_code = ? AND nav_date BETWEEN ? AND ?
  INDEX idx_scheme_date_range (scheme_code, nav_date),
  
  FOREIGN KEY (scheme_code) REFERENCES funds(scheme_code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: analytics
-- Precomputed metrics for each fund and window
-- 
-- Stores:
-- - Rolling returns (min, max, median, p25, p75)
-- - Max drawdown
-- - CAGR distribution (min, max, median)
-- ============================================
CREATE TABLE IF NOT EXISTS analytics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scheme_code VARCHAR(20) NOT NULL,
  window_type ENUM('1Y','3Y','5Y','10Y') NOT NULL,
  
  -- Rolling return statistics
  rolling_return_min DECIMAL(10,4),
  rolling_return_max DECIMAL(10,4),
  rolling_return_median DECIMAL(10,4),
  rolling_return_p25 DECIMAL(10,4),
  rolling_return_p75 DECIMAL(10,4),
  
  -- Risk metric
  max_drawdown DECIMAL(10,4),
  
  -- CAGR distribution
  cagr_min DECIMAL(10,4),
  cagr_max DECIMAL(10,4),
  cagr_median DECIMAL(10,4),
  
  -- Data range used for computation
  data_start_date DATE,
  data_end_date DATE,
  
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- One analytics row per scheme per window
  UNIQUE KEY uk_scheme_window (scheme_code, window_type),
  
  -- For ranking queries: SELECT WHERE window_type = ? ORDER BY rolling_return_median
  INDEX idx_window_type (window_type),
  
  FOREIGN KEY (scheme_code) REFERENCES funds(scheme_code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: sync_state
-- Pipeline progress tracking for resumability
-- 
-- Enables:
-- 1. Resume after crash (last_synced_date)
-- 2. Status monitoring (status enum)
-- 3. Error tracking (error_message)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scheme_code VARCHAR(20) NOT NULL,
  sync_type ENUM('backfill','incremental') NOT NULL,
  status ENUM('pending','in_progress','completed','failed') DEFAULT 'pending',
  
  -- For resume capability
  last_synced_date DATE,
  total_records INT DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- One sync state per scheme per sync type
  UNIQUE KEY uk_scheme_sync_type (scheme_code, sync_type),
  
  -- For querying pending/failed syncs
  INDEX idx_status (status),
  INDEX idx_sync_type_status (sync_type, status),
  
  FOREIGN KEY (scheme_code) REFERENCES funds(scheme_code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: pipeline_status
-- Global pipeline state tracking
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_status (
  id INT PRIMARY KEY DEFAULT 1,
  status ENUM('idle','running','paused','failed') DEFAULT 'idle',
  current_phase VARCHAR(50),
  progress_percent DECIMAL(5,2) DEFAULT 0,
  total_schemes INT DEFAULT 0,
  completed_schemes INT DEFAULT 0,
  failed_schemes INT DEFAULT 0,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  last_error TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Ensure only one row
  CONSTRAINT chk_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize pipeline status row
INSERT IGNORE INTO pipeline_status (id, status) VALUES (1, 'idle');
