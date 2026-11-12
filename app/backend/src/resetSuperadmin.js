// Recovery for a forgotten SUPER ADMIN password. Run on the server (it needs the database settings in .env), so only
// someone with server access can use it. Other users reset their password through the portal, with super admin approval.
//
//   npm run reset:superadmin                      (resets "superadmin"; you are asked for the new password)
//   npm run reset:superadmin -- other_admin       (a different super admin account)
//   NEW_SUPERADMIN_PASSWORD=... npm run reset:superadmin     (non-interactive)
//
// Signed-in sessions of that account stop working at once: they are tied to the old password.
import 'dotenv/config';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool, users, auditLogs } from './db/index.js';
import { checkNewPassword } from './common/password.js';

const username = (process.argv[2] || 'superadmin').trim();
const ask = (question, { hidden = false } = {}) => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(question); };
  rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
});

try {
  const [u] = await db.select().from(users).where(eq(users.username, username));
  if (!u) throw new Error(`No user named "${username}".`);
  if (u.role !== 'SUPER_ADMIN') throw new Error(`"${username}" is not a super admin. Other users reset their password in the portal, with super admin approval.`);

  let pw = process.env.NEW_SUPERADMIN_PASSWORD;
  if (!pw) {
    if (!process.stdin.isTTY) throw new Error('Run this in a terminal, or set NEW_SUPERADMIN_PASSWORD.');
    if ((await ask(`This resets the password of "${username}". Type the username to confirm: `)).trim() !== username) throw new Error('Cancelled.');
    pw = await ask('New password (at least 10 characters): ', { hidden: true });
    if (pw !== await ask('Repeat new password: ', { hidden: true })) throw new Error('The passwords do not match.');
  }
  checkNewPassword(pw, username);
  await db.update(users).set({ passwordHash: await bcrypt.hash(String(pw), 12) }).where(eq(users.id, u.id));
  await db.insert(auditLogs).values({ actor: 'server console', action: 'SUPERADMIN_RECOVERY', level: 'WARN', message: `Password of ${username} was reset from the server console` });
  console.log(`Password of "${username}" has been changed. Sign in with it now, then keep it somewhere safe.`);
} catch (e) { console.error(e.message || e); process.exitCode = 1; }
finally { await pool.end(); }
