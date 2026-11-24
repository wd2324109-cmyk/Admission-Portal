import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { users, access } from '../schema/index.js';
import { db } from '../db/index.js';
import { signToken } from '../common/auth.js';
import { newSessionId, newDeviceId, pwStamp, endDevice } from '../common/session.js';
import { HttpError } from '../common/http.js';
import { makeLimiter } from '../common/rateLimit.js';
import { checkNewPassword } from '../common/password.js';
import { classesOf, ACTIVE } from '../common/access.js';
import { msmsSignIn } from '../common/msms.js';
import { CLASSES } from '../common/studentStore.js';
import { isFrozen, FROZEN_MSG } from '../common/freeze.js';

const byUser = makeLimiter({ max: 8 }), byIp = makeLimiter({ max: 30 }), byPwChange = makeLimiter({ max: 5 });
const DUMMY = bcrypt.hashSync('not-a-real-password', 12);
const LOCKED = '!msms';
const DEFAULT_CLASSES = String(process.env.MSMS_DEFAULT_CLASSES ?? '9,10').split(',').map(Number).filter(c => CLASSES.includes(c));
const profileOf = (u, name = null) => ({ id: u.id, username: u.username, name, role: u.role, region: u.region, district: u.district });

async function syncMsmsUser(p) {
  const find = () => db.select().from(users).where(sql`lower(${users.username}) = ${p.username.toLowerCase()}`);
  let [row] = await find();
  if (row?.role === 'SUPER_ADMIN' && row.passwordHash !== LOCKED) throw new HttpError('Invalid credentials', 401);
  if (!row) {
    await db.insert(users).values({ username: p.username, passwordHash: LOCKED, role: p.role, region: p.region, district: p.district }).onConflictDoNothing();
    [row] = await find();
    if (DEFAULT_CLASSES.length && row && p.role !== 'SUPER_ADMIN') {
      const have = await db.select().from(access).where(and(eq(access.user, row.username), eq(access.tag, ACTIVE)));
      if (!have.length) await db.insert(access).values(DEFAULT_CLASSES.map(c => ({ user: row.username, classLevel: String(c), tag: ACTIVE })));
    }
    return row;
  }
  const [fresh] = await db.update(users).set({ role: p.role, region: p.region, district: p.district, passwordHash: LOCKED }).where(eq(users.id, row.id)).returning();
  return fresh;
}

export const authService = {
  async login({ body, ip }) {
    const { username, password } = body || {};
    if (!username || !password) throw new HttpError('Username and password are required');
    const name = String(username).slice(0, 100), userKey = `${ip}|${name.toLowerCase()}`, ipKey = `ip|${ip}`;
    if (byUser.blocked(userKey) || byIp.blocked(ipKey))
      throw new HttpError('Too many failed attempts. Try again later.', 429, { retryAfter: Math.max(byUser.retryAfter(userKey), byIp.retryAfter(ipKey)) });
    const [local] = await db.select().from(users).where(sql`lower(${users.username}) = ${name.trim().toLowerCase()}`);
    let u, fullName = null;
    if (local?.role === 'SUPER_ADMIN' && local.passwordHash !== LOCKED) {
      const ok = (await bcrypt.compare(String(password), local.passwordHash)) && !!local;
      if (!ok) { byUser.fail(userKey); byIp.fail(ipKey); console.warn(`Failed sign-in for "${name}" from ${ip}`); throw new HttpError('Invalid credentials', 401); }
      u = local;
    } else {
      let p;
      try { p = await msmsSignIn(name.trim(), String(password)); }
      catch (e) { if (e.status === 401) { byUser.fail(userKey); byIp.fail(ipKey); console.warn(`Failed MSMS sign-in for "${name}" from ${ip}`); } throw e; }
      u = await syncMsmsUser(p);
      fullName = p.name;   // from the MSMS login response; not stored in the database, it travels in the token
    }
    byUser.clear(userKey);
    if (await isFrozen(u.username, { fresh: true })) throw new HttpError(FROZEN_MSG, 403, { code: 'ACCOUNT_FROZEN' });
    // Signing in again does not end the other devices: the account session id is kept if there is one, and this device gets its own id.
    const [{ sid }] = await db.update(users).set({ sessionId: sql`coalesce(${users.sessionId}, ${newSessionId()})` }).where(eq(users.id, u.id)).returning({ sid: users.sessionId });
    const did = newDeviceId(), profile = profileOf(u, fullName);
    return { token: signToken({ ...profile, sid, did, t: Date.now(), pv: pwStamp(u.passwordHash) }), user: { ...profile, classes: await classesOf(profile) } };
  },
  async logout({ user }) {
    endDevice(user.did);
    return { ok: true };
  },
  async session({ user }) { const { sid, did, ...profile } = user; return { ok: true, user: { ...profile, classes: await classesOf(profile) } }; },
  async changePassword({ user, body }) {
    if (user.role !== 'SUPER_ADMIN') throw new HttpError('Your password is managed in MSMS. Change it there.', 403);
    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword) throw new HttpError('Current and new password are required');
    checkNewPassword(newPassword, user.username);
    if (newPassword === currentPassword) throw new HttpError('New password must be different from the current one');
    const key = `pw|${user.id}`;
    if (byPwChange.blocked(key)) throw new HttpError('Too many wrong attempts. Try again later.', 429, { retryAfter: byPwChange.retryAfter(key) });
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    if (u?.passwordHash === LOCKED) throw new HttpError('Your password is managed in MSMS. Change it there.', 403);
    if (!u || !(await bcrypt.compare(String(currentPassword), u.passwordHash))) { byPwChange.fail(key); throw new HttpError('Current password is wrong'); }
    byPwChange.clear(key);
    const hash = await bcrypt.hash(String(newPassword), 12), sid = newSessionId();
    await db.update(users).set({ passwordHash: hash, sessionId: sid }).where(eq(users.id, u.id));
    const { sid: _old, did, ...profile } = user;
    return { ok: true, token: signToken({ ...profile, sid, did, t: Date.now(), pv: pwStamp(hash) }) };
  },
};
