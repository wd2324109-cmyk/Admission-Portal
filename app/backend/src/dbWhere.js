// Shows which database the app really connects to and what the users table looks like THERE.   npm run db:where
import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
try {
  const who = (await pool.query(`select current_database() as database, current_schema() as schema, inet_server_addr()::text as server, inet_server_port() as port, current_user as "user"`)).rows[0];
  console.log('Connected to:', who);
  const cols = (await pool.query(`select table_schema, column_name from information_schema.columns where table_name = 'users' order by table_schema, ordinal_position`)).rows;
  const bySchema = {};
  for (const c of cols) (bySchema[c.table_schema] ??= []).push(c.column_name);
  console.log('Columns of table "users", per schema:', bySchema);
  console.log(cols.some(c => c.table_schema === who.schema && c.column_name === 'session_id') ? 'session_id EXISTS in this database/schema.' : 'session_id is MISSING in this database/schema: run  npm run db:setup  (the app is NOT looking at the database you checked by hand).');
} catch (e) { console.error('Could not connect:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
