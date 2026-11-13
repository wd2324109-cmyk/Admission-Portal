// The Drizzle schema must match the database document exactly (no database needed).   node src/spec/schema.test.js
import assert from 'node:assert';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as S from '../schema/index.js';
import { SPEC } from './spec.js';

const tables = Object.values(S).map(t => { try { return getTableConfig(t); } catch { return null; } }).filter(Boolean);
const TYPE = { PgSerial: 'serial', PgText: 'text', PgInteger: 'integer', PgBoolean: 'boolean', PgTimestamp: 'timestamp' };
assert.deepEqual(tables.map(t => t.name).sort(), SPEC.tables.map(t => t.name).sort(), 'the schema must define exactly the tables of the document');
for (const want of SPEC.tables) {
  const have = tables.find(t => t.name === want.name);
  assert.deepEqual(have.columns.map(c => c.name), want.columns.map(c => c.name), `${want.name}: columns differ from the document`);
  have.columns.forEach((c, i) => assert.equal(TYPE[c.columnType], want.columns[i].type, `${want.name}.${c.name}: type differs from the document`));
}
console.log(`Schema matches the document: ${SPEC.tables.length} tables, ${SPEC.tables.reduce((n, t) => n + t.columns.length, 0)} columns`);
