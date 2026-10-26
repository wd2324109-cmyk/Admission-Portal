import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, pool, users, students, vacancies, statusLogs, auditLogs } from './db/index.js';
import { buildSample } from './sampleData.js';

const sample = process.argv.includes('--sample');
const h = p => bcrypt.hashSync(p, 12);
const random = () => crypto.randomBytes(9).toString('base64url');
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

if (sample) {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to load sample data in production.'); process.exit(1); }
  const { sts, vacs } = buildSample(), regionPw = random(), districtPw = random();
  for (const t of [auditLogs, statusLogs, students, vacancies, users]) await db.delete(t);
  await db.insert(users).values([
    { username: 'region_cuddalore', passwordHash: h(regionPw), role: 'REGION', region: 'CUDDALORE' },
    { username: 'district_cuddalore', passwordHash: h(districtPw), role: 'DISTRICT', district: 'CUDDALORE' }]);
  for (const c of chunk(sts, 500)) await db.insert(students).values(c);
  for (const c of chunk(vacs, 500)) await db.insert(vacancies).values(c);
  console.log(`Sample data: ${sts.length} students, ${vacs.length} vacancy cells`);
  console.log(`Sample logins: region_cuddalore / ${regionPw}   district_cuddalore / ${districtPw}`);
}
const adminPw = process.env.SEED_ADMIN_PASSWORD || random();
const added = await db.insert(users).values({ username: 'superadmin', passwordHash: h(adminPw), role: 'SUPER_ADMIN' }).onConflictDoNothing({ target: users.username }).returning({ u: users.username });
console.log(added.length ? `Super admin created: superadmin / ${adminPw}   (save it now; it is not shown again. Change it after the first sign-in.)` : 'Super admin already exists; password unchanged.');
await pool.end();
