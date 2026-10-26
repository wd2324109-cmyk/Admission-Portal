import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { signToken } from '../../common/auth.js';
import { HttpError } from '../../common/http.js';
import { makeLimiter } from '../../common/rateLimit.js';
import { AuthService } from '../auth.service.js';

const byUser = makeLimiter({ max: 8 }), byIp = makeLimiter({ max: 30 });
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

export class AuthServiceImpl extends AuthService {
  async login({ body, ip }) {
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
    await audit(db, { user: profile }, { action: 'LOGIN', message: 'Signed in' });
    return { token: signToken(profile), user: profile };
  }

  async logout({ user }) {
    await audit(db, { user }, { action: 'LOGOUT', message: 'Signed out' });
    return { ok: true };
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
    await db.update(users).set({ passwordHash: bcrypt.hashSync(String(newPassword), 12) }).where(eq(users.id, u.id));
    await audit(db, { user }, { action: 'PASSWORD_CHANGED', message: 'Password changed' });
    return { ok: true };
  }
}
