/**
 * Database Migration Runner
 * 
 * Executes SQL migration files in order.
 * Simple approach suitable for this project - runs all migrations on startup.
 * 
 * Usage: npm run migrate
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true, // Required for running multi-statement SQL files
};

const DATABASE_NAME = process.env.MYSQL_DATABASE || 'mutual_fund_analytics';

async function runMigrations() {
  let connection;
  
  try {
    // Connect without database first to create it if needed
    connection = await mysql.createConnection(config);
    console.log('Connected to MySQL server');

    // Create database if it doesn't exist
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\``);
    console.log(`Database '${DATABASE_NAME}' ensured`);

    // Switch to the database
    await connection.changeUser({ database: DATABASE_NAME });
    console.log(`Switched to database: ${DATABASE_NAME}`);

    // Read and execute migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure alphabetical order

    for (const file of files) {
      console.log(`\nRunning migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      try {
        await connection.query(sql);
        console.log(`✓ Migration ${file} completed successfully`);
      } catch (err) {
        // Ignore "already exists" errors for idempotency
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⊘ Table already exists, skipping...`);
        } else if (err.code === 'ER_DUP_ENTRY') {
          console.log(`⊘ Duplicate entry, skipping...`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n✓ All migrations completed successfully');
    
    // Verify tables were created
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\nCreated tables:');
    tables.forEach(row => {
      const tableName = Object.values(row)[0];
      console.log(`  - ${tableName}`);
    });

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\nDatabase connection closed');
    }
  }
}

// Run migrations when executed directly
runMigrations();

export { runMigrations };
