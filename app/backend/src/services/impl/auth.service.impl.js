import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { users } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { signToken } from '../../common/auth.js';
import { startSession, endSession, endOtherSessions } from '../../common/session.js';
import { HttpError } from '../../common/http.js';
import { makeLimiter } from '../../common/rateLimit.js';
import { AuthService } from '../auth.service.js';

const byUser = makeLimiter({ max: 8 }), byIp = makeLimiter({ max: 30 });
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

export class AuthServiceImpl extends AuthService {
  async login({ body, ip, agent }) {
    const { username, password } = body || {};
    if (!username || !password) throw new HttpError('Username and password are required');
    const name = String(username).slice(0, 100), userKey = `${ip}|${name.toLowerCase()}`, ipKey = `ip|${ip}`;
    if (byUser.blocked(userKey) || byIp.blocked(ipKey))
      throw new HttpError('Too many failed attempts. Try again later.', 429, { retryAfter: Math.max(byUser.retryAfter(userKey), byIp.retryAfter(ipKey)) });
    const [u] = await db.select().from(users).where(eq(users.username, name));
    const ok = bcrypt.compareSync(String(password), u ? u.passwordHash : DUMMY) && !!u;
    if (!ok) {
      byUser.fail(userKey); byIp.fail(ipKey);
      await audit(db, null, { action: 'LOGIN_FAILED', level: 'WARN', actor: name, message: `Failed login attempt from ${ip}` });
      throw new HttpError('Invalid credentials', 401);
    }
    byUser.clear(userKey);
    const profile = { id: u.id, username: u.username, role: u.role, region: u.region, district: u.district };
    if (u.frozenAt) {
      await audit(db, { user: profile }, { action: 'LOGIN_BLOCKED', level: 'WARN', message: `Sign-in from ${ip} refused: access is frozen` });
      throw new HttpError('Your access has been frozen by the administrator. Please contact them to restore it.', 403, { code: 'ACCOUNT_FROZEN' });
    }
    // Every sign-in is its own independent device session; any number may be active at once.
    const { sid } = await startSession(u.id, { ip, agent });
    await audit(db, { user: profile }, { action: 'LOGIN', message: `Signed in from ${ip}` });
    return { token: signToken({ ...profile, sid }), user: profile };
  }

  async logout({ user }) {
    await endSession(user.id, user.sid);
    await audit(db, { user }, { action: 'LOGOUT', message: 'Signed out' });
    return { ok: true };
  }

  // Heartbeat: the auth middleware has already validated and refreshed the session by the time this runs.
  async session({ user }) {
    const { sid, ...profile } = user;
    return { ok: true, user: profile };
  }

  async changePassword({ user, body }) {
    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword) throw new HttpError('Current and new password are required');
    if (String(newPassword).length < 10) throw new HttpError('New password must be at least 10 characters');
    if (String(newPassword).length > 200) throw new HttpError('New password is too long');
    if (newPassword === currentPassword) throw new HttpError('New password must be different from the current one');
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    if (!u || !bcrypt.compareSync(String(currentPassword), u.passwordHash)) {
      await audit(db, { user }, { action: 'PASSWORD_CHANGE_FAILED', level: 'WARN', message: 'Wrong current password' });
      throw new HttpError('Current password is wrong');
    }
    // Compare-and-set on the old hash: if two devices change the password at once, only one can win.
    // All OTHER devices are signed out (the old password may have been compromised); this one carries on.
    await db.transaction(async tx => {
      const [done] = await tx.update(users).set({ passwordHash: bcrypt.hashSync(String(newPassword), 12) })
        .where(and(eq(users.id, u.id), eq(users.passwordHash, u.passwordHash))).returning({ id: users.id });
      if (!done) throw new HttpError('The password was just changed from another device. Please sign in again.', 409);
      await endOtherSessions(u.id, user.sid, tx);
    });
    await audit(db, { user }, { action: 'PASSWORD_CHANGED', message: 'Password changed; other devices signed out' });
    return { ok: true };
  }
}
