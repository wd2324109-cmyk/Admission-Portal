import 'dotenv/config';
import pg from 'pg';
import { describeProfile, SCHEMA } from './db/profile.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
try {
  const who = (await pool.query(`select current_database() as database, current_schema() as schema, inet_server_addr()::text as server, inet_server_port() as port, current_user as "user"`)).rows[0];
  console.log('Profile:', describeProfile());
  console.log('Connected to:', who);
  const cols = (await pool.query(`select table_schema, column_name from information_schema.columns where table_name = 'users' order by table_schema, ordinal_position`)).rows;
  const home = SCHEMA || who.schema;
  const bySchema = {};
  for (const c of cols) (bySchema[c.table_schema] ??= []).push(c.column_name);
  console.log('Columns of table "users", per schema:', bySchema);
  console.log(cols.some(c => c.table_schema === home && c.column_name === 'session_id') ? `session_id EXISTS in ${home}.` : `session_id is MISSING in ${home}: run  npm run db:setup${SCHEMA ? ':prod' : ''}  (the app is NOT looking at the database you checked by hand).`);
} catch (e) { console.error('Could not connect:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
