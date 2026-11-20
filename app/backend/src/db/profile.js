// Which database layout the app uses.   DB_PROFILE=test (default) | production      (or  --profile=production  on any db:* script)
//
//   test        the existing test database: tables in the connection's default schema, named exactly as in the database document
//               ("Students_master_9th", "Student_LOG", "VACANCY_logs", ...).
//   production  the production database: everything inside the `core` schema (DB_SCHEMA to override), table names in lower case with the prefix
//               enrollment_ (DB_TABLE_PREFIX to override):  core.enrollment_access, core.enrollment_student_log, core.enrollment_vacancy_logs,
//               core.enrollment_students_master_9th, core.enrollment_vacancies_9th ...
//
// Column names are the same in both profiles (the document's). `npm run db:verify` tells you if a live database differs.
const fromArg = process.argv.find(a => a.startsWith('--profile='))?.split('=')[1];
export const PROFILE = String(fromArg || process.env.DB_PROFILE || 'test').trim().toLowerCase();
if (!['test', 'production'].includes(PROFILE)) throw new Error(`DB_PROFILE must be "test" or "production" (got "${PROFILE}")`);

export const IS_PRODUCTION_DB = PROFILE === 'production';
/** null = the connection's default schema (test). */
export const SCHEMA = IS_PRODUCTION_DB ? (process.env.DB_SCHEMA || 'core').trim() : null;
if (SCHEMA && !/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error(`DB_SCHEMA "${SCHEMA}" is not a plain lower-case schema name`);

export const TABLE_PREFIX = IS_PRODUCTION_DB ? (process.env.DB_TABLE_PREFIX ?? 'enrollment_').trim() : '';
if (TABLE_PREFIX && !/^[a-z_][a-z0-9_]*$/.test(TABLE_PREFIX)) throw new Error(`DB_TABLE_PREFIX "${TABLE_PREFIX}" is not a plain lower-case prefix`);
/** Table name of a table of the document, in the active profile. */
export const tableName = documentName => IS_PRODUCTION_DB ? TABLE_PREFIX + documentName.toLowerCase() : documentName;
const quote = n => `"${n.replace(/"/g, '""')}"`;
/** Quoted, schema-qualified name for hand-written SQL:  qualified('Vacancies_9th') -> "core"."vacancies_9th" (production) / "Vacancies_9th" (test). */
export const qualified = documentName => (SCHEMA ? `${quote(SCHEMA)}.` : '') + quote(tableName(documentName));
/** SQL that scripts run before they touch tables. */
export const schemaSql = () => (SCHEMA ? `CREATE SCHEMA IF NOT EXISTS ${quote(SCHEMA)}` : null);
/** SQL fragment for information_schema lookups: the schema this profile lives in. */
export const schemaFilter = (alias = 'table_schema') => SCHEMA ? `${alias} = '${SCHEMA}'` : `${alias} = current_schema()`;
export const describeProfile = () => IS_PRODUCTION_DB ? `PRODUCTION (schema "${SCHEMA}", tables ${SCHEMA}.${TABLE_PREFIX}*)` : 'TEST (default schema, document table names)';
