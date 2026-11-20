import { pgTable, pgSchema } from 'drizzle-orm/pg-core';
import { SCHEMA, tableName } from '../db/profile.js';

const ns = SCHEMA ? pgSchema(SCHEMA) : null;
export const table = (documentName, columns, extra) => ns ? ns.table(tableName(documentName), columns, extra) : pgTable(documentName, columns, extra);
