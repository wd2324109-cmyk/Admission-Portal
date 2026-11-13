import { SPEC } from './spec.js';

const q = n => `"${n.replace(/"/g, '""')}"`;
const SQL_TYPE = { serial: 'SERIAL PRIMARY KEY', text: 'TEXT', integer: 'INTEGER', boolean: 'BOOLEAN', timestamp: 'TIMESTAMP' };

/** CREATE TABLE statements for exactly the tables and columns of the document, in the document's order. */
export const createTables = () => SPEC.tables.map(t =>
  `CREATE TABLE IF NOT EXISTS ${q(t.name)} (\n  ${t.columns.map(c => `${q(c.name)} ${SQL_TYPE[c.type]}`).join(',\n  ')}\n)`);

/** For tables that already exist from an older version: add any column of the document that is missing (for example users.session_id). Never drops or changes anything. */
export const addMissingColumns = () => SPEC.tables.flatMap(t => t.columns.filter(c => c.type !== 'serial')
  .map(c => `ALTER TABLE ${q(t.name)} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${SQL_TYPE[c.type]}`));

/** Indexes only speed things up; they add no tables or columns. */
export const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS access_user_class_uq ON access ("User", "Class_level")`,
  ...[9, 10, 11].flatMap(c => [
    `CREATE INDEX IF NOT EXISTS students_${c}th_emis_idx ON "Students_master_${c}th" ("Emis")`,
    `CREATE INDEX IF NOT EXISTS students_${c}th_status_idx ON "Students_master_${c}th" (select_status, admit_status)`,
    `CREATE INDEX IF NOT EXISTS students_${c}th_district_idx ON "Students_master_${c}th" (district, "Gender", medium)`,
    `CREATE INDEX IF NOT EXISTS students_${c}th_newdist_idx ON "Students_master_${c}th" ("New_distc_name")`,
    `CREATE INDEX IF NOT EXISTS vacancies_${c}th_cell_idx ON "Vacancies_${c}th" ("New_district", gender, medium, community)`,
  ]),
  `CREATE INDEX IF NOT EXISTS student_log_emis_idx ON "Student_LOG" ("class", "Emis", id)`,
  `CREATE INDEX IF NOT EXISTS vacancy_logs_idx ON "VACANCY_logs" (class_level, id)`,
];
