import { and, eq, asc } from 'drizzle-orm';
import { users } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { activeDevices, endAllSessions } from '../../common/session.js';
import { frozenUsers, forgetFrozen, frozenMessage, restoredMessage } from '../../common/freeze.js';
import { UserService } from '../user.service.js';

export class UserServiceImpl extends UserService {
  async list() {
    const [rows, frozen] = await Promise.all([
      db.select({ id: users.id, username: users.username, role: users.role, region: users.region, district: users.district }).from(users).orderBy(asc(users.role), asc(users.username)),
      frozenUsers()]);
    const live = activeDevices();
    return rows.map(u => { const f = frozen.get(u.username);
      return { ...u, frozenAt: f ? new Date(f.at).toISOString() : null, frozenBy: f?.by ?? null, frozenReason: f?.reason ?? null, activeDevices: live.get(u.id) || 0 }; });
  }

  async freeze({ user, params, body }) {
    const id = +params.id || 0, reason = String(body?.reason || '').trim();
    if (!reason) throw new HttpError('A reason is required to freeze access');
    if (reason.length > 300) throw new HttpError('Reason is too long (300 characters at most)');
    if (id === user.id) throw new HttpError('You cannot freeze your own access', 409);
    let target;
    await db.transaction(async tx => {
      // Lock every super admin first so two admins freezing each other at the same time cannot lock everyone out:
      // the second one waits here, then sees the first one's freeze when it reads the audit log below.
      const admins = await tx.select({ id: users.id, username: users.username }).from(users).where(eq(users.role, 'SUPER_ADMIN')).orderBy(users.id).for('update');
      const [t] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!t) throw new HttpError('User not found', 404);
      const frozen = await frozenUsers(tx, { fresh: true });
      if (frozen.has(t.username)) throw new HttpError('This user is already frozen', 409);
      if (t.role === 'SUPER_ADMIN' && admins.filter(a => a.id !== t.id && !frozen.has(a.username)).length < 1) throw new HttpError('At least one active super admin must remain', 409);
      await audit(tx, { user }, { action: 'FREEZE', level: 'WARN', message: frozenMessage(t.username, reason) });
      target = t;
    });
    endAllSessions(target.id);                               // every device is signed out right now
    forgetFrozen();
    return { ok: true };
  }

  async unfreeze({ user, params }) {
    const id = +params.id || 0;
    await db.transaction(async tx => {
      const [t] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!t) throw new HttpError('User not found', 404);
      if (!(await frozenUsers(tx, { fresh: true })).has(t.username)) throw new HttpError('This user is not frozen', 409);
      await audit(tx, { user }, { action: 'UNFREEZE', message: restoredMessage(t.username) });
    });
    forgetFrozen();
    return { ok: true };
  }
}
