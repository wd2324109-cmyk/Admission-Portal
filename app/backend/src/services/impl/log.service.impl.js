import { and, eq, gt, ilike, or, sql, desc } from 'drizzle-orm';
import { students as S, vacancies as V, statusLogs, auditLogs as A } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { likeEsc } from '../../common/query.js';

import { LogService } from '../log.service.js';

export class LogServiceImpl extends LogService {
  async list({ user, params, query, body }) {
    const { action, level, q } = query, term = String(q || '').trim();
    const where = and(action ? eq(A.action, String(action)) : undefined, level ? eq(A.level, String(level)) : undefined,
      term ? or(ilike(A.message, `%${likeEsc(term)}%`), ilike(A.actor, `%${likeEsc(term)}%`), Number.isInteger(+term) ? eq(A.regno, +term) : undefined) : undefined);
    const rows = await db.select().from(A).where(where).orderBy(desc(A.id)).limit(Math.min(+query.limit || 300, 1000));
    const live = await db.select({ id: A.id, ids: A.studentIds }).from(A).where(and(sql`${A.undo} is not null`, sql`${A.revokedAt} is null`));
    const can = e => !!e.undo && !e.revokedAt && !live.some(l => l.id > e.id && (l.ids || []).some(i => (e.studentIds || []).includes(i)));
    return (rows.reverse().map(e => ({ ...e, undo: undefined, canRevoke: can(e) })));
  }

  async revoke({ user, params, query, body }) {
    const remarks = String(body?.remarks || '').trim();
    if (!remarks) throw new HttpError('Remarks are required to revoke');
    const [e] = await db.select().from(A).where(eq(A.id, +params.id || 0));
    if (!e || !e.undo) throw new HttpError('This entry cannot be revoked');
    if (e.revokedAt) throw new HttpError('Already revoked');
    const later = await db.select({ id: A.id, ids: A.studentIds, action: A.action }).from(A).where(and(gt(A.id, e.id), sql`${A.undo} is not null`, sql`${A.revokedAt} is null`));
    const hit = later.find(l => (l.ids || []).some(i => (e.studentIds || []).includes(i)));
    if (hit) throw new HttpError(`Revoke #${hit.id} (${hit.action}) first: it changed the same student(s) later`, 409);
    const u = e.undo;
    await db.transaction(async tx => {
      for (const x of u.students || []) {
        await tx.update(S).set(x.before).where(eq(S.id, x.id));
        await tx.insert(statusLogs).values({ studentId: x.id, field: 'revoke', oldValue: e.action, newValue: 'Revoked', remarks, changedBy: user.username });
      }
      for (const v of u.vac || []) await tx.update(V).set({ admitted: sql`greatest(${V.admitted} - ${v.dAdmitted ?? 0}, 0)`, vacancies: sql`greatest(${V.vacancies} - ${v.dVacancies ?? 0}, 0)` }).where(eq(V.id, v.id));
      for (const x of u.docs || []) {                                                
        const [st] = await tx.select({ documents: S.documents }).from(S).where(eq(S.id, x.id));
        const docs = { ...(st?.documents || {}) }; if (x.before) docs[x.type] = x.before; else delete docs[x.type];
        await tx.update(S).set({ documents: docs }).where(eq(S.id, x.id));
      }
      await tx.update(A).set({ revokedAt: new Date(), revokedBy: user.username, revokeRemarks: remarks }).where(eq(A.id, e.id));
      await audit(tx, { user }, { action: 'REVOKE', level: 'WARN', regno: e.regno, message: `Revoked #${e.id} ${e.action}: ${remarks}` });
    });
    return ({ ok: true });
  }
}
