import 'dotenv/config';
import pg from 'pg';
import { createSchema, createTables, addMissingColumns, INDEXES } from './spec/ddl.js';
import { TABLE_NAMES } from './spec/spec.js';
import { IS_PRODUCTION_DB, SCHEMA, describeProfile, schemaFilter, qualified } from './db/profile.js';
import { verify } from './dbVerify.js';
import { planProduction, applyPlan } from './prodAlign.js';

const has = f => process.argv.includes(f);
if (has('--drop-legacy') && IS_PRODUCTION_DB) { console.error('--drop-legacy is refused on the production profile.'); process.exit(1); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
try {
  console.log('Profile:', describeProfile());
  if (IS_PRODUCTION_DB) {
    const plan = await planProduction(pool);
    for (const p of plan) {
      console.log(`\n[${p.status}] ${SCHEMA}.${p.name}${p.rows == null ? '' : `  (${p.rows} rows)`}`);
      p.notes.forEach(n => console.log('   note:', n));
      (p.status === 'SKIPPED' ? p.wanted : p.sql).forEach(s => console.log(p.status === 'SKIPPED' ? '   would need:' : '   ', s));
    }
    const todo = plan.filter(p => p.status === 'ALTER').reduce((n, p) => n + p.sql.length, 0);
    if (!has('--apply')) console.log(`\nPLAN ONLY - nothing was changed. ${todo} statement(s) on ${plan.filter(p => p.status === 'ALTER').length} empty table(s). Run again with --apply to execute.`);
    else {
      await applyPlan(pool, plan);
      console.log(`\nApplied ${todo} statement(s).`);
      if (has('--indexes')) { const problems = await verify(pool); if (problems.length) throw new Error('indexes not created, tables still differ:\n  - ' + problems.join('\n  - ')); for (const q of INDEXES) await pool.query(q); console.log('Indexes ready.'); }
    }
  } else {
    for (const q of createSchema()) await pool.query(q);
    if (has('--drop-legacy')) {
      const views = (await pool.query(`select table_name from information_schema.views where ${schemaFilter()}`)).rows.map(r => r.table_name);
      for (const v of views) { await pool.query(`DROP VIEW IF EXISTS "${v}" CASCADE`); console.log('Dropped view', v); }
      const tables = (await pool.query(`select table_name from information_schema.tables where ${schemaFilter()} and table_type = 'BASE TABLE'`)).rows.map(r => r.table_name);
      for (const t of tables.filter(t => !TABLE_NAMES.includes(t))) { await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`); console.log('Dropped legacy table', t); }
    }
    for (const q of createTables()) await pool.query(q);
    for (const q of addMissingColumns()) await pool.query(q);
    for (const q of INDEXES) await pool.query(q);
    // Older data: "Waiting (reconsidered)" (1B) no longer exists. Those students become reconsidered students: select status and admit status become empty (null).
    for (const t of ['Students_master_9th', 'Students_master_10th']) {
      const r = await pool.query(`UPDATE ${qualified(t)} SET select_status = NULL, admit_status = NULL WHERE upper(trim(coalesce(select_status, ''))) = '1B'`);
      if (r.rowCount) console.log(`${t}: ${r.rowCount} student(s) moved from 1B to reconsidered (select status empty)`);
    }
    console.log('Tables are ready:', TABLE_NAMES.join(', '));
  }
} catch (e) { console.error('Setup failed:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
