import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users } from '../schema/index.js';
import { db } from '../db/index.js';
import { signToken } from '../common/auth.js';
import { newSessionId, pwStamp, forget } from '../common/session.js';
import { HttpError } from '../common/http.js';
import { makeLimiter } from '../common/rateLimit.js';
import { checkNewPassword } from '../common/password.js';
import { classesOf } from '../common/access.js';

const byUser = makeLimiter({ max: 8 }), byIp = makeLimiter({ max: 30 }), byPwChange = makeLimiter({ max: 5 });
const DUMMY = bcrypt.hashSync('not-a-real-password', 12);            // same cost as real hashes, so unknown users take as long as known ones
const profileOf = u => ({ id: u.id, username: u.username, role: u.role, region: u.region, district: u.district });

export const authService = {
  async login({ body, ip }) {
    const { username, password } = body || {};
    if (!username || !password) throw new HttpError('Username and password are required');
    const name = String(username).slice(0, 100), userKey = `${ip}|${name.toLowerCase()}`, ipKey = `ip|${ip}`;
    if (byUser.blocked(userKey) || byIp.blocked(ipKey))
      throw new HttpError('Too many failed attempts. Try again later.', 429, { retryAfter: Math.max(byUser.retryAfter(userKey), byIp.retryAfter(ipKey)) });
    const [u] = await db.select().from(users).where(eq(users.username, name));
    const ok = (await bcrypt.compare(String(password), u ? u.passwordHash : DUMMY)) && !!u;
    if (!ok) { byUser.fail(userKey); byIp.fail(ipKey); console.warn(`Failed sign-in for "${name}" from ${ip}`); throw new HttpError('Invalid credentials', 401); }
    byUser.clear(userKey);
    const sid = newSessionId();
    await db.update(users).set({ sessionId: sid }).where(eq(users.id, u.id));             // signs out any other device
    const profile = profileOf(u);
    return { token: signToken({ ...profile, sid, t: Date.now(), pv: pwStamp(u.passwordHash) }), user: { ...profile, classes: await classesOf(profile) } };
  },
  async logout({ user }) {
    await db.update(users).set({ sessionId: null }).where(eq(users.id, user.id));
    forget(user.sid);
    return { ok: true };
  },
  async session({ user }) { const { sid, ...profile } = user; return { ok: true, user: { ...profile, classes: await classesOf(profile) } }; },
  async changePassword({ user, body }) {
    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword) throw new HttpError('Current and new password are required');
    checkNewPassword(newPassword, user.username);
    if (newPassword === currentPassword) throw new HttpError('New password must be different from the current one');
    const key = `pw|${user.id}`;
    if (byPwChange.blocked(key)) throw new HttpError('Too many wrong attempts. Try again later.', 429, { retryAfter: byPwChange.retryAfter(key) });
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    if (!u || !(await bcrypt.compare(String(currentPassword), u.passwordHash))) { byPwChange.fail(key); throw new HttpError('Current password is wrong'); }
    byPwChange.clear(key);
    const hash = await bcrypt.hash(String(newPassword), 12), sid = newSessionId();
    await db.update(users).set({ passwordHash: hash, sessionId: sid }).where(eq(users.id, u.id));    // other devices are signed out, this one continues
    const { sid: _old, ...profile } = user;
    return { ok: true, token: signToken({ ...profile, sid, t: Date.now(), pv: pwStamp(hash) }) };
  },
};
