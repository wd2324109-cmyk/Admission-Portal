import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../schema/index.js';

if (process.env.DATABASE_SSL === 'true' && process.env.DATABASE_SSL_INSECURE === 'true' && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: DATABASE_SSL_INSECURE=true turns off database certificate checks. Use it only for local debugging; remove it (or set the provider CA) in production.');
}
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: +process.env.DB_POOL_MAX || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined,
});
pool.on('error', e => console.error('Idle database client error:', e.message));
export const db = drizzle(pool, { schema });
export * from '../schema/index.js';
