import fs from 'node:fs';
import { tableName } from '../db/profile.js';

export const SPEC = JSON.parse(fs.readFileSync(new URL('./dbSpec.json', import.meta.url), 'utf8'));
export const LIVE_NAME = Object.fromEntries(SPEC.tables.map(t => [t.name, tableName(t.name)]));
export const TABLE_NAMES = SPEC.tables.map(t => LIVE_NAME[t.name]);
export const PG_TYPE = { serial: 'integer', text: 'text', integer: 'integer', boolean: 'boolean', timestamp: 'timestamp without time zone' };
