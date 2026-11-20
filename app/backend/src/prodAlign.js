// PRODUCTION ONLY. Brings the EXISTING tables of schema core in line with the database document by ALTERing them. It never creates a schema or a table.
// A table is altered only when it has NO rows. A table with data is left untouched and its differences are only reported.
// Per empty table: a column spelled differently (case only) is RENAMED, a missing column is ADDED, a column of the wrong type is retyped. Nothing is ever dropped: a column the document does not have is kept and only reported.
// (ALTER cannot reorder columns; verify ignores column order on the production profile.)
import { SPEC, LIVE_NAME } from './spec/spec.js';
import { qualified, SCHEMA } from './db/profile.js';

const q = n => `"${n.replace(/"/g, '""')}"`;
const SQL_TYPE = { serial: 'SERIAL PRIMARY KEY', text: 'TEXT', integer: 'INTEGER', boolean: 'BOOLEAN', timestamp: 'TIMESTAMP' };
const PG_TYPE = { serial: 'integer', text: 'text', integer: 'integer', boolean: 'boolean', timestamp: 'timestamp without time zone' };
const CAST = { text: 'text', integer: 'integer', boolean: 'boolean', timestamp: 'timestamp' };

export async function planProduction(pool) {
  const plan = [];
  for (const t of SPEC.tables) {
    const name = LIVE_NAME[t.name], full = qualified(t.name);
    const live = (await pool.query(`select column_name, data_type from information_schema.columns where table_schema = '${SCHEMA}' and table_name = '${name}' order by ordinal_position`)).rows;
    if (!live.length) { plan.push({ name, status: 'MISSING', rows: null, sql: [], notes: [`table ${SCHEMA}.${name} does not exist - NOT created`] }); continue; }
    const rows = (await pool.query(`select count(*)::int as n from ${full}`)).rows[0].n;
    const sql = [], notes = [];
    const unmatched = new Map(live.map(c => [c.column_name, c]));
    const want = t.columns.filter(c => !unmatched.delete(c.name));          // document columns not present under their exact name
    // columns present with the exact name: check the type
    for (const c of t.columns) {
      const l = live.find(x => x.column_name === c.name);
      if (l && l.data_type !== PG_TYPE[c.type]) {
        if (c.type === 'serial') notes.push(`${c.name}: is ${l.data_type}, document says serial (id) - not changed`);
        else sql.push(`ALTER TABLE ${full} ALTER COLUMN ${q(c.name)} TYPE ${SQL_TYPE[c.type]} USING ${q(c.name)}::${CAST[c.type]}`);
      }
    }
    for (const c of want) {
      const twin = [...unmatched.values()].find(l => l.column_name.toLowerCase() === c.name.toLowerCase());
      if (twin) { unmatched.delete(twin.column_name); sql.push(`ALTER TABLE ${full} RENAME COLUMN ${q(twin.column_name)} TO ${q(c.name)}`);
        if (twin.data_type !== PG_TYPE[c.type] && c.type !== 'serial') sql.push(`ALTER TABLE ${full} ALTER COLUMN ${q(c.name)} TYPE ${SQL_TYPE[c.type]} USING ${q(c.name)}::${CAST[c.type]}`); }
      else sql.push(`ALTER TABLE ${full} ADD COLUMN ${q(c.name)} ${SQL_TYPE[c.type]}`);
    }
    for (const l of unmatched.values()) notes.push(`extra column ${l.column_name} is not in the document - kept (nothing is ever dropped)`);
    const status = !sql.length && !notes.some(n => !n.startsWith('extra column')) ? 'OK' : rows === 0 ? 'ALTER' : 'SKIPPED';
    if (status === 'SKIPPED') notes.push(`has ${rows} row(s): left untouched. Differences: ${sql.length} change(s) needed`);
    plan.push({ name, status, rows, sql: status === 'ALTER' ? sql : [], wanted: sql, notes });
  }
  return plan;
}

export async function applyPlan(pool, plan) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const p of plan.filter(p => p.status === 'ALTER')) for (const s of p.sql) await c.query(s);
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
