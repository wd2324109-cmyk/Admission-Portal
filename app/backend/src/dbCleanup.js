import 'dotenv/config';
import pg from 'pg';
import { putDocs } from './common/docstore.js';
import { frozenMessage } from './common/freeze.js';
import { migrateVacancies } from './vacancyMigration.js';














const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
const hasCol = async (t, c) => (await pool.query(`select 1 from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = $2`, [t, c])).rowCount > 0;
const hasTable = async t => (await pool.query(`select 1 from information_schema.tables where table_schema = current_schema() and table_name = $1`, [t])).rowCount > 0;

try {
  if (!(await hasTable('users'))) { console.log('Nothing to clean: the database has no tables yet.'); process.exit(0); }
  const notes = [];

  const m = await migrateVacancies(pool);          // convert the old vacancies table (one row per community) before anything can drop it
  if (m.seats) notes.push(`${m.cells} vacancy row(s) converted to ${m.seats} seats`);


  if (await hasCol('students', 'documents')) {
    const { rows } = await pool.query(`select id, documents from students where documents <> '{}'::jsonb`);
    for (const r of rows) await putDocs(r.id, r.documents);
    notes.push(`${rows.length} student document record(s) written to ${'uploads/documents'}`);
  }

  const c = await pool.connect();
  try {
    await c.query('begin');

    if (await hasCol('students', 'tc')) {
      if (!(await hasTable('tc_requests'))) await c.query(`create table tc_requests (id serial primary key, student_id integer not null, reason text not null, letter_name text not null, letter_path text not null,
        status text not null default 'PENDING', requested_by text not null, requested_at timestamp not null default now(), reviewed_by text, reviewed_at timestamp, review_remarks text)`);
      const r = await c.query(`insert into tc_requests (student_id, reason, letter_name, letter_path, status, requested_by, requested_at, reviewed_by, reviewed_at, review_remarks)
        select s.id, s.tc->>'reason', s.tc->>'letterName', s.tc->>'letterPath', coalesce(s.tc->>'status', 'PENDING'), coalesce(s.tc->>'requestedBy', 'unknown'),
               coalesce((s.tc->>'requestedAt')::timestamptz at time zone 'UTC', now()), s.tc->>'reviewedBy', (s.tc->>'reviewedAt')::timestamptz at time zone 'UTC', s.tc->>'remarks'
        from students s where s.tc is not null and not exists (select 1 from tc_requests t where t.student_id = s.id)`);
      notes.push(`${r.rowCount} TC request(s) moved to tc_requests`);
    }

    if (await hasCol('users', 'frozen_at')) {
      const { rows } = await c.query(`select username, frozen_by, frozen_reason, frozen_at from users where frozen_at is not null`);
      for (const u of rows) await c.query(`insert into audit_logs (at, actor, role, action, level, message) values ($1, $2, 'SUPER_ADMIN', 'FREEZE', 'WARN', $3)`,
        [u.frozen_at, u.frozen_by || 'system', frozenMessage(u.username, u.frozen_reason || 'frozen')]);
      notes.push(`${rows.length} frozen user(s) recorded in audit_logs`);
    }

    await c.query(`drop table if exists user_sessions`);
    await c.query(`drop table if exists student_documents`);
    await c.query(`alter table users drop column if exists frozen_at, drop column if exists frozen_by, drop column if exists frozen_reason`);
    await c.query(`alter table students drop column if exists documents, drop column if exists tc`);
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  console.log(notes.length ? 'Cleanup done: ' + notes.join('; ') + '.' : 'Database already matches the design.');
} catch (e) { console.error('Cleanup failed:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
