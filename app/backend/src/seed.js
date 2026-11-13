// First-run logins: a super admin (the State Enrollment Team) and a state coordinator (State Regional Coordinator).  npm run seed
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, pool, users, access } from './db/index.js';
import { eq } from 'drizzle-orm';

const random = () => crypto.randomBytes(9).toString('base64url');
const make = async (username, role, envName) => {
  const [have] = await db.select().from(users).where(eq(users.username, username));
  if (have) return console.log(`${username} already exists; password unchanged.`);
  const pw = process.env[envName] || random();
  await db.insert(users).values({ username, passwordHash: bcrypt.hashSync(pw, 12), role });
  if (role !== 'SUPER_ADMIN') await db.insert(access).values([9, 10].map(c => ({ user: username, classLevel: String(c), tag: 'ACTIVE' })));
  console.log(`${username} created${process.env[envName] ? ` (password from ${envName})` : `: ${pw}`}   (Change it after the first sign-in.)`);
};
try { await make('superadmin', 'SUPER_ADMIN', 'SEED_ADMIN_PASSWORD'); await make('state_coordinator', 'STATE', 'SEED_STATE_PASSWORD'); }
catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
