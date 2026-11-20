import { SPEC } from './spec.js';
import { qualified, schemaSql } from '../db/profile.js';

const q = n => `"${n.replace(/"/g, '""')}"`;
const SQL_TYPE = { serial: 'SERIAL PRIMARY KEY', text: 'TEXT', integer: 'INTEGER', boolean: 'BOOLEAN', timestamp: 'TIMESTAMP' };

export const createSchema = () => [schemaSql()].filter(Boolean);

export const createTables = () => SPEC.tables.map(t =>
  `CREATE TABLE IF NOT EXISTS ${qualified(t.name)} (\n  ${t.columns.map(c => `${q(c.name)} ${SQL_TYPE[c.type]}`).join(',\n  ')}\n)`);

export const addMissingColumns = () => SPEC.tables.flatMap(t => t.columns.filter(c => c.type !== 'serial')
  .map(c => `ALTER TABLE ${qualified(t.name)} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${SQL_TYPE[c.type]}`));

export const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON ${qualified('users')} (username)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS access_user_class_uq ON ${qualified('access')} ("User", "Class_level")`,
  ...[9, 10, 11].flatMap(c => [
    `CREATE INDEX IF NOT EXISTS students_${c}th_emis_idx ON ${qualified(`Students_master_${c}th`)} ("Emis")`,
    `CREATE INDEX IF NOT EXISTS students_${c}th_status_idx ON ${qualified(`Students_master_${c}th`)} (select_status, admit_status)`,
    `CREATE INDEX IF NOT EXISTS students_${c}th_district_idx ON ${qualified(`Students_master_${c}th`)} (district, "Gender", medium)`,
    `CREATE INDEX IF NOT EXISTS students_${c}th_newdist_idx ON ${qualified(`Students_master_${c}th`)} ("New_distc_name")`,
    `CREATE INDEX IF NOT EXISTS vacancies_${c}th_cell_idx ON ${qualified(`Vacancies_${c}th`)} ("New_district", gender, medium, community)`,
  ]),
  `CREATE INDEX IF NOT EXISTS student_log_emis_idx ON ${qualified('Student_LOG')} ("class", "Emis", id)`,
  `CREATE INDEX IF NOT EXISTS vacancy_logs_idx ON ${qualified('VACANCY_logs')} (class_level, id)`,
];
