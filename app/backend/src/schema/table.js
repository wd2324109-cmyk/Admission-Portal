import { pgTable, pgSchema } from 'drizzle-orm/pg-core';
import { SCHEMA, tableName } from '../db/profile.js';

// Every table of the document is declared through this, so the same code runs on the test database (default schema, "Students_master_9th")
// and on the production database (schema core, students_master_9th). See db/profile.js.
const ns = SCHEMA ? pgSchema(SCHEMA) : null;
export const table = (documentName, columns, extra) => ns ? ns.table(tableName(documentName), columns, extra) : pgTable(documentName, columns, extra);
