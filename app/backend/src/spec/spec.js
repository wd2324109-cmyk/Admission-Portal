import fs from 'node:fs';
// The database document, as data (generated from Admission_Portal_Database_Tables.docx into dbSpec.json).
// This is the single source of truth for "which tables and columns may exist". dbVerify.js checks a live database against
// it, and spec/schema.test.js checks the Drizzle schema against it.
export const SPEC = JSON.parse(fs.readFileSync(new URL('./dbSpec.json', import.meta.url), 'utf8'));
export const TABLE_NAMES = SPEC.tables.map(t => t.name);
export const PG_TYPE = { serial: 'integer', text: 'text', integer: 'integer', boolean: 'boolean', timestamp: 'timestamp without time zone' };
