import { and, eq, isNull, isNotNull, sql, asc } from 'drizzle-orm';
import { users, userSessions as SS } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { IDLE_SECONDS } from '../../common/session.js';
import { UserService } from '../user.service.js';

export class UserServiceImpl extends UserService {
  async list() {
    const live = sql`(select count(*)::int from user_sessions s where s.user_id = users.id and s.last_seen > now() - (${IDLE_SECONDS}::double precision * interval '1 second'))`;
    return db.select({ id: users.id, username: users.username, role: users.role, region: users.region, district: users.district,
      frozenAt: users.frozenAt, frozenBy: users.frozenBy, frozenReason: users.frozenReason, activeDevices: live })
      .from(users).orderBy(asc(users.role), asc(users.username));
  }

  async freeze({ user, params, body }) {
    const id = +params.id || 0, reason = String(body?.reason || '').trim();
    if (!reason) throw new HttpError('A reason is required to freeze access');
    if (reason.length > 300) throw new HttpError('Reason is too long (300 characters at most)');
    if (id === user.id) throw new HttpError('You cannot freeze your own access', 409);
    await db.transaction(async tx => {
      // Lock every active super admin first so two admins freezing each other at the same time cannot lock everyone out.
      const admins = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, 'SUPER_ADMIN'), isNull(users.frozenAt))).orderBy(users.id).for('update');
      const [t] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!t) throw new HttpError('User not found', 404);
      if (t.frozenAt) throw new HttpError('This user is already frozen', 409);
      if (t.role === 'SUPER_ADMIN' && admins.filter(a => a.id !== t.id).length < 1) throw new HttpError('At least one active super admin must remain', 409);
      await tx.update(users).set({ frozenAt: sql`now()`, frozenBy: user.username, frozenReason: reason }).where(eq(users.id, id));
      await tx.delete(SS).where(eq(SS.userId, id));          // every device is signed out right now
      await audit(tx, { user }, { action: 'FREEZE', level: 'WARN', message: `Access frozen for ${t.username}: ${reason}` });
    });
    return { ok: true };
  }

  async unfreeze({ user, params }) {
    const id = +params.id || 0;
    await db.transaction(async tx => {
      const [t] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!t) throw new HttpError('User not found', 404);
      if (!t.frozenAt) throw new HttpError('This user is not frozen', 409);
      await tx.update(users).set({ frozenAt: null, frozenBy: null, frozenReason: null }).where(eq(users.id, id));
      await audit(tx, { user }, { action: 'UNFREEZE', message: `Access restored for ${t.username}` });
    });
    return { ok: true };
  }
}
