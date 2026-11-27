import 'dotenv/config';
import pg from 'pg';
import { qualified, describeProfile } from './db/profile.js';

// One-time move of existing TC requests to the new TC codes.
//   old 8A (tag2 TC-RC)   waiting for the RC             -> 8A  TC Requested        (code unchanged, label updated)
//   old 8A (tag2 TC-SRC)  RC approved, waiting for SC    -> 8B  TC - RC Approved
//   old 8B                TC issued                      -> 8D  TC Issued
// Safe to run again: new 8B rows carry tag2 TC-SC, so they are never taken for an old "TC issued" row.
// Without --apply it only counts what would change. The student log is updated the same way so the history shows the new codes.
const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });

const LABEL = { '8A': 'TC Requested', '8B': 'TC - RC Approved', '8D': 'TC Issued' };
const students = ['Students_master_9th', 'Students_master_10th'].map(qualified), log = qualified('Student_LOG');

// Order matters: old "issued" rows (8B) must become 8D before the old "waiting for SC" rows become the new 8B.
const steps = (t, isLog) => [
  [`old TC issued -> 8D`, `UPDATE ${t} SET select_status = '8D', admit_status = '${LABEL['8D']}'${isLog ? `, "Update_status_after" = '8D'` : ''}
     WHERE select_status = '8B' AND coalesce(tag2, '') <> 'TC-SC'${isLog ? ` AND coalesce("Update_status_after", '8B') = '8B'` : ''}`],
  [`old RC-approved -> 8B`, `UPDATE ${t} SET select_status = '8B', admit_status = '${LABEL['8B']}', tag2 = 'TC-SC'${isLog ? `, "Update_status_after" = '8B'` : ''}
     WHERE select_status = '8A' AND tag2 = 'TC-SRC'`],
  [`waiting for RC -> label 8A`, `UPDATE ${t} SET admit_status = '${LABEL['8A']}', tag2 = coalesce(nullif(tag2, ''), 'TC-RC')
     WHERE select_status = '8A' AND (admit_status IS DISTINCT FROM '${LABEL['8A']}' OR coalesce(tag2, '') = '')`],
];

const client = await pool.connect();
try {
  console.log('Profile:', describeProfile(), APPLY ? '(APPLY)' : '(dry run: nothing is changed; add --apply to apply)');
  await client.query('BEGIN');
  for (const t of [...students, log]) for (const [name, sql] of steps(t, t === log)) {
    const r = await client.query(sql);
    console.log(`${t}: ${name}: ${r.rowCount} row(s)`);
  }
  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
  console.log(APPLY ? 'Done.' : 'Dry run finished, nothing was changed.');
} catch (e) { await client.query('ROLLBACK').catch(() => {}); console.error(e.message); process.exitCode = 1; } finally { client.release(); await pool.end(); }
