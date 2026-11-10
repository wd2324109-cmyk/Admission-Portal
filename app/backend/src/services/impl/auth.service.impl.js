import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { users } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { signToken } from '../../common/auth.js';
import { startSession, endSession, endOtherSessions, endAllSessions, pwStamp } from '../../common/session.js';
import { frozenUsers } from '../../common/freeze.js';
import { HttpError } from '../../common/http.js';
import { makeLimiter } from '../../common/rateLimit.js';
import { TEST_RESET } from '../../common/testReset.js';
import { AuthService } from '../auth.service.js';

const byUser = makeLimiter({ max: 8 }), byIp = makeLimiter({ max: 30 });
const resetByIp = makeLimiter({ max: 20 });
const byPwChange = makeLimiter({ max: 5 });                         // wrong "current password" guesses, per account
const DUMMY = bcrypt.hashSync('not-a-real-password', 12);           // same cost as real hashes, so unknown users take as long as known ones
// bcrypt only reads the first 72 bytes, so a longer password would silently be cut short: refuse it instead.
const checkNewPassword = (pw, username = '') => {
  const p = String(pw);
  if (p.length < 10) throw new HttpError('New password must be at least 10 characters');
  if (Buffer.byteLength(p, 'utf8') > 72) throw new HttpError('New password is too long (72 bytes at most)');
  if (username && p.toLowerCase().includes(String(username).toLowerCase())) throw new HttpError('New password must not contain the username');
};

export class AuthServiceImpl extends AuthService {
  async login({ body, ip, agent }) {
    const { username, password } = body || {};
    if (!username || !password) throw new HttpError('Username and password are required');
    const name = String(username).slice(0, 100), userKey = `${ip}|${name.toLowerCase()}`, ipKey = `ip|${ip}`;
    if (byUser.blocked(userKey) || byIp.blocked(ipKey))
      throw new HttpError('Too many failed attempts. Try again later.', 429, { retryAfter: Math.max(byUser.retryAfter(userKey), byIp.retryAfter(ipKey)) });
    const [u] = await db.select().from(users).where(eq(users.username, name));
    const ok = (await bcrypt.compare(String(password), u ? u.passwordHash : DUMMY)) && !!u;
    if (!ok) {
      byUser.fail(userKey); byIp.fail(ipKey);
      await audit(db, null, { action: 'LOGIN_FAILED', level: 'WARN', actor: name, message: `Failed login attempt from ${ip}` });
      throw new HttpError('Invalid credentials', 401);
    }
    byUser.clear(userKey);
    const profile = { id: u.id, username: u.username, role: u.role, region: u.region, district: u.district };
    if ((await frozenUsers(db, { fresh: true })).has(u.username)) {
      await audit(db, { user: profile }, { action: 'LOGIN_BLOCKED', level: 'WARN', message: `Sign-in from ${ip} refused: access is frozen` });
      throw new HttpError('Your access has been frozen by the administrator. Please contact them to restore it.', 403, { code: 'ACCOUNT_FROZEN' });
    }

    const { sid, t } = startSession(u.id);
    await audit(db, { user: profile }, { action: 'LOGIN', message: `Signed in from ${ip}` });
    return { token: signToken({ ...profile, sid, t, pv: pwStamp(u.passwordHash) }), user: profile };
  }

  async logout({ user }) {
    endSession(user.id, user.sid);
    await audit(db, { user }, { action: 'LOGOUT', message: 'Signed out' });
    return { ok: true };
  }


  async session({ user }) {
    const { sid, ...profile } = user;
    return { ok: true, user: profile };
  }

  async changePassword({ user, body }) {
    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword) throw new HttpError('Current and new password are required');
    checkNewPassword(newPassword, user.username);
    if (newPassword === currentPassword) throw new HttpError('New password must be different from the current one');
    const pwKey = `pw|${user.id}`;
    if (byPwChange.blocked(pwKey)) throw new HttpError('Too many wrong attempts. Try again later.', 429, { retryAfter: byPwChange.retryAfter(pwKey) });
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    if (!u || !(await bcrypt.compare(String(currentPassword), u.passwordHash))) {
      byPwChange.fail(pwKey);
      await audit(db, { user }, { action: 'PASSWORD_CHANGE_FAILED', level: 'WARN', message: 'Wrong current password' });
      throw new HttpError('Current password is wrong');
    }
    byPwChange.clear(pwKey);
    const newHash = await bcrypt.hash(String(newPassword), 12);
    const [done] = await db.update(users).set({ passwordHash: newHash })
      .where(and(eq(users.id, u.id), eq(users.passwordHash, u.passwordHash))).returning({ id: users.id });
    if (!done) throw new HttpError('The password was just changed from another device. Please sign in again.', 409);
    endOtherSessions(u.id, user.sid);
    await audit(db, { user }, { action: 'PASSWORD_CHANGED', message: 'Password changed; other devices signed out' });

    const { sid, ...profile } = user;
    return { ok: true, token: signToken({ ...profile, sid, t: Date.now(), pv: pwStamp(newHash) }) };
  }

  // TEST ONLY: set a new password by username, no email/OTP. Disabled unless ENABLE_TEST_PASSWORD_RESET=true and NODE_ENV != production.
  async testResetPassword({ body, ip }) {
    if (!TEST_RESET) throw new HttpError('Not found', 404);
    const key = `reset|${ip}`;
    if (resetByIp.blocked(key)) throw new HttpError('Too many attempts. Try again later.', 429);
    resetByIp.fail(key);
    const { username, newPassword } = body || {};
    if (!username || !newPassword) throw new HttpError('Username and new password are required');
    const name = String(username).slice(0, 100);
    checkNewPassword(newPassword, name);
    const [u] = await db.select().from(users).where(eq(users.username, name));
    if (!u) throw new HttpError('No user with that username', 404);
    await db.update(users).set({ passwordHash: await bcrypt.hash(String(newPassword), 12) }).where(eq(users.id, u.id));
    endAllSessions(u.id);
    await audit(db, { user: { username: u.username, role: u.role } }, { action: 'PASSWORD_RESET_TEST', level: 'WARN', message: `TEST-ONLY password reset from ${ip}; all sessions signed out` });
    return { ok: true };
  }
}
