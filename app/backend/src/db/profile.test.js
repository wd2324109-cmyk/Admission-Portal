// The two database profiles produce the right table names and SQL (no database needed).   node src/db/profile.test.js
// Each profile is checked in its own process, because the profile is read once when the app starts.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';

const probe = `
  import { getTableConfig } from 'drizzle-orm/pg-core';
  import { PgDialect } from 'drizzle-orm/pg-core';
  import { sql } from 'drizzle-orm';
  import * as S from './src/schema/index.js';
  import { qualified } from './src/db/profile.js';
  import { createTables, INDEXES } from './src/spec/ddl.js';
  const d = new PgDialect();
  const cfg = t => { const c = getTableConfig(t); return [c.schema ?? null, c.name]; };
  const t = Object.fromEntries(Object.entries(S).filter(([, v]) => { try { getTableConfig(v); return true; } catch { return false; } }).map(([k, v]) => [k, cfg(v)]));
  console.log(JSON.stringify({ t, q: qualified('Vacancies_9th'), raw: d.sqlToQuery(sql\`select 1 from \${S.studentLog}\`).sql, ddl: createTables().join(';'), idx: INDEXES.join(';') }));`;
const run = (profile, env = {}) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DB_PROFILE: profile, ...env }, cwd: new URL('../..', import.meta.url), encoding: 'utf8' }).trim().split('\n').pop());

const test = run('test'), prod = run('production');
assert.deepEqual(test.t.students9th, [null, 'Students_master_9th']);
assert.equal(test.q, '"Vacancies_9th"');
assert.match(test.raw, /from "Student_LOG"/);

const want = { users: 'enrollment_users', access: 'enrollment_access', studentLog: 'enrollment_student_log', vacancyLogs: 'enrollment_vacancy_logs', students9th: 'enrollment_students_master_9th', vacancies9th: 'enrollment_vacancies_9th',
  students10th: 'enrollment_students_master_10th', vacancies10th: 'enrollment_vacancies_10th', students11th: 'enrollment_students_master_11th', vacancies11th: 'enrollment_vacancies_11th' };
for (const [k, n] of Object.entries(want)) assert.deepEqual(prod.t[k], ['core', n], `production: ${k} must be core.${n}`);
assert.equal(prod.q, '"core"."enrollment_vacancies_9th"');
assert.match(prod.raw, /from "core"\."enrollment_student_log"/);
assert.ok(prod.ddl.includes('CREATE TABLE IF NOT EXISTS "core"."enrollment_students_master_9th"'));
assert.ok(!/CREATE TABLE IF NOT EXISTS "(?!core")/.test(prod.ddl), 'production DDL must create only schema-qualified tables');
assert.ok(prod.idx.includes('ON "core"."enrollment_student_log"'));
assert.equal(run('production', { DB_SCHEMA: 'core_v2' }).q, '"core_v2"."enrollment_vacancies_9th"');
assert.equal(run('production', { DB_TABLE_PREFIX: '' }).q, '"core"."vacancies_9th"');
assert.throws(() => run('staging'), /DB_PROFILE must be/);
console.log('Database profiles OK: test = default schema, production = core.enrollment_* (10 tables)');
