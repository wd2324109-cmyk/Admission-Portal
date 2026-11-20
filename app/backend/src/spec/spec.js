import fs from 'node:fs';
import { tableName } from '../db/profile.js';
// The database document, as data (generated from Admission_Portal_Database_Tables.docx into dbSpec.json).
// This is the single source of truth for "which tables and columns may exist". dbVerify.js checks a live database against
// it, and spec/schema.test.js checks the Drizzle schema against it.
// dbSpec.json keeps the document's names ("Students_master_9th"). The names the ACTIVE database uses (test: the same; production: lower case in schema core)
// are in LIVE_NAME / TABLE_NAMES, so everything that talks to the database goes through those.
export const SPEC = JSON.parse(fs.readFileSync(new URL('./dbSpec.json', import.meta.url), 'utf8'));
export const LIVE_NAME = Object.fromEntries(SPEC.tables.map(t => [t.name, tableName(t.name)]));
export const TABLE_NAMES = SPEC.tables.map(t => LIVE_NAME[t.name]);
export const PG_TYPE = { serial: 'integer', text: 'text', integer: 'integer', boolean: 'boolean', timestamp: 'timestamp without time zone' };
