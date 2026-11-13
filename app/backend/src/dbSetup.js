// Creates the 10 tables of the database document (and nothing else).
//   npm run db:setup                 creates any missing table, adds indexes
//   npm run db:setup -- --drop-legacy  ALSO drops every table that is not in the document (old students, vacancies, audit_logs,
//                                      status_logs, tc_requests, password_resets, user_sessions, student_documents, views ...)
// Run `npm run db:verify` afterwards: it fails if a table or column differs from the document.
import 'dotenv/config';
import pg from 'pg';
import { createTables, addMissingColumns, INDEXES } from './spec/ddl.js';
import { TABLE_NAMES } from './spec/spec.js';

const dropLegacy = process.argv.includes('--drop-legacy');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
try {
  if (dropLegacy) {
    const views = (await pool.query(`select table_name from information_schema.views where table_schema = current_schema()`)).rows.map(r => r.table_name);
    for (const v of views) { await pool.query(`DROP VIEW IF EXISTS "${v}" CASCADE`); console.log('Dropped view', v); }
    const tables = (await pool.query(`select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'`)).rows.map(r => r.table_name);
    for (const t of tables.filter(t => !TABLE_NAMES.includes(t))) { await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`); console.log('Dropped legacy table', t); }
    // a table of the document that still carries old columns (for example users.frozen_at) is rebuilt only if it is empty; otherwise verify will tell you
  }
  for (const q of createTables()) await pool.query(q);
  for (const q of addMissingColumns()) await pool.query(q);                    // an older table gets the columns it lacks (e.g. users.session_id)
  for (const q of INDEXES) await pool.query(q);
  console.log('Tables are ready:', TABLE_NAMES.join(', '));
} catch (e) { console.error('Setup failed:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
