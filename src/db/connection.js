/**
 * MySQL Database Connection Pool
 * 
 * Uses mysql2/promise for async/await support.
 * Connection pooling enables efficient reuse of database connections.
 */

import mysql from 'mysql2/promise';
import config from '../config/index.js';
import { logger } from '../logger/index.js';

let pool = null;

/**
 * Creates and returns the MySQL connection pool.
 * Uses singleton pattern - only one pool is created.
 * 
 * @returns {mysql.Pool} MySQL connection pool
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      connectionLimit: config.mysql.connectionLimit,
      waitForConnections: config.mysql.waitForConnections,
      queueLimit: config.mysql.queueLimit,
      // Enable named placeholders for cleaner queries
      namedPlaceholders: true,
      // Return dates as strings to avoid timezone issues
      dateStrings: true,
    });

    logger.info('MySQL connection pool created', {
      host: config.mysql.host,
      port: config.mysql.port,
      database: config.mysql.database,
      connectionLimit: config.mysql.connectionLimit,
    });
  }
  return pool;
}

/**
 * Tests database connectivity by executing a simple query.
 * Useful for health checks and startup validation.
 * 
 * @returns {Promise<boolean>} True if connection is healthy
 */
async function testConnection() {
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT 1 as health');
    logger.info('MySQL connection test successful');
    return rows[0].health === 1;
  } catch (error) {
    logger.error('MySQL connection test failed', { error: error.message });
    throw error;
  }
}

/**
 * Gracefully closes all connections in the pool.
 * Should be called during application shutdown.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL connection pool closed');
  }
}

/**
 * Executes a query with automatic connection handling.
 * 
 * @param {string} sql - SQL query string
 * @param {Array|Object} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Executes a query and returns the first row.
 * 
 * @param {string} sql - SQL query string
 * @param {Array|Object} params - Query parameters
 * @returns {Promise<Object|null>} First row or null
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Executes an INSERT/UPDATE/DELETE and returns affected info.
 * 
 * @param {string} sql - SQL statement
 * @param {Array|Object} params - Query parameters
 * @returns {Promise<Object>} Result info with affectedRows, insertId, etc.
 */
async function execute(sql, params = []) {
  const pool = getPool();
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * Starts a transaction and returns a connection for transactional operations.
 * Caller is responsible for committing/rolling back and releasing the connection.
 * 
 * @returns {Promise<mysql.PoolConnection>} Connection with active transaction
 */
async function beginTransaction() {
  const pool = getPool();
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

export {
  getPool,
  testConnection,
  closePool,
  query,
  queryOne,
  execute,
  beginTransaction,
};
