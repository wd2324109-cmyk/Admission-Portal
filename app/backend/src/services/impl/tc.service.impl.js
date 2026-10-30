import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, sql, desc } from 'drizzle-orm';
import { students as S, vacancies as V, statusLogs, tcRequests as T } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { HttpError } from '../../common/http.js';
import { scope } from '../../common/query.js';
import { audit, before } from '../../common/audit.js';
import { UPLOADS } from '../../common/paths.js';
import { saveUpload } from '../../common/upload.js';
import { lockClass, lockStudent, lockVacancy } from '../../common/locks.js';
import { latestTc, TC_SNAP } from '../../common/tc.js';
import { TcService } from '../tc.service.js';

// The id the screens use is the STUDENT id: every action works on that student's current (latest) TC request.
const view = (t, s) => ({ id: s.id, studentId: s.id, reason: t.reason, letterName: t.letterName, status: t.status, requestedBy: t.requestedBy, requestedAt: t.requestedAt,
  reviewedBy: t.reviewedBy ?? null, reviewedAt: t.reviewedAt ?? null, reviewRemarks: t.reviewRemarks ?? null,
  regno: s.regno, name: s.name, classLevel: s.classLevel, district: s.district, gender: s.gender, community: s.community });

export class TcServiceImpl extends TcService {
  async list({ user, query }) {
    const rows = await db.selectDistinctOn([T.studentId]).from(T).innerJoin(S, eq(S.id, T.studentId)).where(scope(user)).orderBy(T.studentId, desc(T.id));
    return rows.filter(r => !query.status || r.tc_requests.status === String(query.status)).map(r => view(r.tc_requests, r.students))
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  }

  async raise({ user, body }) {
    const { studentId, reason = '', fileName, fileData } = body || {};
    const [pre] = await db.select().from(S).where(and(eq(S.id, +studentId || 0), scope(user)));
    if (!pre) throw new HttpError('Student not found in your district', 404);
    const check = async (s, x) => {
      if (s.admitStatus !== 'Admitted') throw new HttpError('A TC can be requested only for admitted students');
      if (!String(reason).trim()) throw new HttpError('Reason is required');
      if (['PENDING', 'APPROVED'].includes((await latestTc(x, s.id))?.status)) throw new HttpError('This student already has a pending or approved TC request', 409);
    };
    await check(pre, db);
    const { stored, name } = await saveUpload(fileName, fileData);
    try {
      await db.transaction(async tx => {
        await lockClass(tx, pre.classLevel);
        const s = await lockStudent(tx, pre.id);
        await check(s, tx);                                  // re-check under the lock: a double-click cannot raise two requests
        await tx.insert(T).values({ studentId: s.id, reason: String(reason).trim(), letterName: name, letterPath: stored, status: 'PENDING', requestedBy: user.username });
        await audit(tx, { user }, { action: 'TC_RAISE', regno: s.regno, studentId: s.id, message: `TC requested for ${s.name}: ${String(reason).trim().slice(0, 80)}` });
      });
    } catch (e) { await fs.unlink(path.join(UPLOADS, stored)).catch(() => {}); throw e; }   // no orphan file when the request is refused
    return { ok: true };
  }

  async letter({ user, params }) {
    const [s] = await db.select().from(S).where(and(eq(S.id, +params.id || 0), scope(user)));
    const t = s && await latestTc(db, s.id);
    if (!t) throw new HttpError('Not found', 404);
    return { file: path.join(UPLOADS, t.letterPath), name: t.letterName };
  }

  async review({ user, params, body }) {
    const { decision, remarks = '' } = body || {};
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError('Invalid decision');
    const note = String(remarks).trim();
    if (!note) throw new HttpError('Please write a message for the district user (required for both approve and not approve)');
    const id = +params.id || 0, ok = decision === 'APPROVED';
    const [pre] = await db.select({ classLevel: S.classLevel }).from(S).where(eq(S.id, id));
    if (!pre) throw new HttpError('Not found', 404);
    await db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const s = await lockStudent(tx, id);
      const t = s && await latestTc(tx, s.id, true);
      if (!t) throw new HttpError('Not found', 404);
      if (t.status !== 'PENDING') throw new HttpError('This request was already reviewed');          // second reviewer lands here
      if (ok && s.admitStatus !== 'Admitted') throw new HttpError('The student is no longer in Admitted status, so the TC cannot be approved');
      const vt = ok ? await lockVacancy(tx, s) : undefined;
      await tx.update(T).set({ status: decision, reviewedBy: user.username, reviewedAt: new Date(), reviewRemarks: note }).where(eq(T.id, t.id));
      if (ok) await tx.update(S).set({ admitStatus: 'TC Issued' }).where(eq(S.id, s.id));
      if (ok) {
        if (vt) await tx.update(V).set({ admitted: sql`greatest(${V.admitted} - 1, 0)`, vacancies: sql`${V.vacancies} + 1` }).where(eq(V.id, vt.id));
        await tx.insert(statusLogs).values({ studentId: s.id, field: 'admitStatus', oldValue: 'Admitted', newValue: 'TC Issued', remarks: note, changedBy: user.username });
      }
      await audit(tx, { user }, { action: `TC_${decision}`, regno: s.regno, message: `TC ${ok ? 'approved' : 'not approved'} for ${s.name}: ${note.slice(0, 80)}`,
        undo: { students: [before(s)], tcs: [{ id: t.id, before: TC_SNAP(t) }], vac: ok && vt ? [{ id: vt.id, dAdmitted: vt.admitted > 0 ? -1 : 0, dVacancies: 1 }] : [] } });
    });
    return { ok: true };
  }
}
