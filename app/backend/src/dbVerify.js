// Compares the live database with the database document: every table and column must exist with the right type, in order,
// and there must be NO extra table, view or column. Exit code 1 when anything differs.   npm run db:verify
import 'dotenv/config';
import pg from 'pg';
import { SPEC, PG_TYPE } from './spec/spec.js';

export async function verify(pool) {
  const problems = [];
  const cols = (await pool.query(`select table_name, column_name, data_type, ordinal_position from information_schema.columns where table_schema = current_schema() order by table_name, ordinal_position`)).rows;
  const objects = (await pool.query(`select table_name, table_type from information_schema.tables where table_schema = current_schema()`)).rows;
  const byTable = new Map();
  for (const c of cols) (byTable.get(c.table_name) ?? byTable.set(c.table_name, []).get(c.table_name)).push(c);
  const known = new Set(SPEC.tables.map(t => t.name));
  for (const o of objects) if (!known.has(o.table_name)) problems.push(`EXTRA ${o.table_type === 'VIEW' ? 'view' : 'table'}: ${o.table_name}`);
  for (const t of SPEC.tables) {
    const live = byTable.get(t.name);
    if (!live) { problems.push(`MISSING table: ${t.name}`); continue; }
    const want = t.columns.map(c => c.name), have = live.map(c => c.column_name);
    for (const w of want) if (!have.includes(w)) problems.push(`MISSING column: ${t.name}.${w}`);
    for (const h of have) if (!want.includes(h)) problems.push(`EXTRA column: ${t.name}.${h}`);
    for (const c of t.columns) { const l = live.find(x => x.column_name === c.name); if (l && l.data_type !== PG_TYPE[c.type]) problems.push(`WRONG type: ${t.name}.${c.name} is ${l.data_type}, document says ${c.type}`); }
    if (!problems.some(p => p.includes(`${t.name}.`)) && want.join('|') !== have.join('|')) problems.push(`ORDER differs: ${t.name}`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
  try {
    const problems = await verify(pool);
    if (problems.length) { console.error(`The database differs from the document:\n  - ${problems.join('\n  - ')}`); process.exitCode = 1; }
    else console.log(`OK: ${SPEC.tables.length} tables, ${SPEC.tables.reduce((n, t) => n + t.columns.length, 0)} columns, exactly as in the document.`);
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
}
