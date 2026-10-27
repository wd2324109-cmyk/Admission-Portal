import { and, eq, desc, asc } from 'drizzle-orm';
import { students as S, statusLogs } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { before, audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { scope, classFilter } from '../../common/query.js';

import { lockClass, lockStudent } from '../../common/locks.js';
import { VerificationService } from '../verification.service.js';

export class VerificationServiceImpl extends VerificationService {
  async list({ user, params, query, body }) {
    const { class: c, status } = query;
    const rows = await db.select().from(S).where(and(scope(user), classFilter(c), eq(S.willingStatus, 'UNWILLING'),
      status ? eq(S.verificationStatus, String(status)) : undefined)).orderBy(desc(S.total), asc(S.orank));
    return (rows);
  }

  async verify({ user, params, query, body }) {
    const { decision, remarks = '' } = body || {};                                 
    if (!['ACCEPTED', 'REJECTED'].includes(decision)) throw new HttpError('Invalid decision');
    const id = +params.id || 0;
    const [pre] = await db.select({ classLevel: S.classLevel }).from(S).where(eq(S.id, id));
    if (!pre) throw new HttpError('Not found', 404);
    await db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const s = await lockStudent(tx, id);                  // two reviewers clicking at once: the second waits, then sees "Decision is final"
      if (!s) throw new HttpError('Not found', 404);
      if (s.willingStatus !== 'UNWILLING' || !s.unwillingLetter) throw new HttpError('Student must be unwilling with a letter on file');
      if (s.verificationStatus !== 'PENDING') throw new HttpError('Decision is final');
      if (decision === 'REJECTED' && !String(remarks).trim()) throw new HttpError('Remarks are required to reject');
      const giveUp = decision === 'ACCEPTED' && s.admitStatus !== 'Admitted' && !s.admitStatus.startsWith('Not Admitted');
      await tx.update(S).set({ verificationStatus: decision, verificationRemarks: remarks, ...(giveUp ? { admitStatus: 'Not Admitted' } : {}) }).where(eq(S.id, s.id));
      await tx.insert(statusLogs).values({ studentId: s.id, field: 'verificationStatus', oldValue: 'PENDING', newValue: decision, remarks, changedBy: user.username });
      await audit(tx, { user }, { action: `VERIFY_${decision}`, regno: s.regno, message: `${s.name}: unwillingness ${decision.toLowerCase()}${remarks ? ' - ' + remarks : ''}`, undo: { students: [before(s)] } });
    });
    return ({ ok: true });
  }
}
