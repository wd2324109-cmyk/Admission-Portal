const fromArg = process.argv.find(a => a.startsWith('--profile='))?.split('=')[1];
export const PROFILE = String(fromArg || process.env.DB_PROFILE || 'test').trim().toLowerCase();
if (!['test', 'production'].includes(PROFILE)) throw new Error(`DB_PROFILE must be "test" or "production" (got "${PROFILE}")`);

export const IS_PRODUCTION_DB = PROFILE === 'production';

export const SCHEMA = IS_PRODUCTION_DB ? (process.env.DB_SCHEMA || 'core').trim() : null;
if (SCHEMA && !/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error(`DB_SCHEMA "${SCHEMA}" is not a plain lower-case schema name`);

export const TABLE_PREFIX = IS_PRODUCTION_DB ? (process.env.DB_TABLE_PREFIX ?? 'enrollment_').trim() : '';
if (TABLE_PREFIX && !/^[a-z_][a-z0-9_]*$/.test(TABLE_PREFIX)) throw new Error(`DB_TABLE_PREFIX "${TABLE_PREFIX}" is not a plain lower-case prefix`);

export const tableName = documentName => IS_PRODUCTION_DB ? TABLE_PREFIX + documentName.toLowerCase() : documentName;
const quote = n => `"${n.replace(/"/g, '""')}"`;

export const qualified = documentName => (SCHEMA ? `${quote(SCHEMA)}.` : '') + quote(tableName(documentName));

export const schemaSql = () => (SCHEMA ? `CREATE SCHEMA IF NOT EXISTS ${quote(SCHEMA)}` : null);

export const schemaFilter = (alias = 'table_schema') => SCHEMA ? `${alias} = '${SCHEMA}'` : `${alias} = current_schema()`;
export const describeProfile = () => IS_PRODUCTION_DB ? `PRODUCTION (schema "${SCHEMA}", tables ${SCHEMA}.${TABLE_PREFIX}*)` : 'TEST (default schema, document table names)';
