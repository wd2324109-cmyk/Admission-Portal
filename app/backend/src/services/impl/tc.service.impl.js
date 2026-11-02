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
import { latestTc, TC_SNAP, TC_STAGES, stageOfRole, rejectedBy, visibleTo } from '../../common/tc.js';
import { TcService } from '../tc.service.js';

// The id the screens use is the STUDENT id: every action works on that student's current (latest) TC request.
// `stage` says where a pending request is (REGION -> STATE -> ADMIN); `rejectedLevel` says who did not approve it.
const view = (t, s) => ({ id: s.id, studentId: s.id, reason: t.reason, letterName: t.letterName, status: t.status, requestedBy: t.requestedBy, requestedAt: t.requestedAt,
  stage: t.stage, rejectedLevel: rejectedBy(t),
  rcBy: t.rcBy ?? null, rcAt: t.rcAt ?? null, rcRemarks: t.rcRemarks ?? null, scBy: t.scBy ?? null, scAt: t.scAt ?? null, scRemarks: t.scRemarks ?? null,
  reviewedBy: t.reviewedBy ?? null, reviewedAt: t.reviewedAt ?? null, reviewRemarks: t.reviewRemarks ?? null,
  regno: s.regno, name: s.name, classLevel: s.classLevel, district: s.district, regionalCentre: s.regionalCentre, gender: s.gender, community: s.community });

export class TcServiceImpl extends TcService {
  async list({ user, query }) {
    const rows = await db.selectDistinctOn([T.studentId]).from(T).innerJoin(S, eq(S.id, T.studentId)).where(scope(user)).orderBy(T.studentId, desc(T.id));
    return rows.filter(r => visibleTo(user, r.tc_requests))
      .filter(r => !query.status || r.tc_requests.status === String(query.status))
      .filter(r => !query.stage || r.tc_requests.stage === String(query.stage))
      .map(r => view(r.tc_requests, r.students))
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
        await tx.insert(T).values({ studentId: s.id, reason: String(reason).trim(), letterName: name, letterPath: stored, status: 'PENDING', stage: 'REGION', requestedBy: user.username });
        await audit(tx, { user }, { action: 'TC_RAISE', regno: s.regno, studentId: s.id, message: `TC requested for ${s.name}: ${String(reason).trim().slice(0, 80)} (sent to the regional coordinator)` });
      });
    } catch (e) { await fs.unlink(path.join(UPLOADS, stored)).catch(() => {}); throw e; }   // no orphan file when the request is refused
    return { ok: true };
  }

  async letter({ user, params }) {
    const [s] = await db.select().from(S).where(and(eq(S.id, +params.id || 0), scope(user)));
    const t = s && await latestTc(db, s.id);
    if (!t || !visibleTo(user, t)) throw new HttpError('Not found', 404);
    return { file: path.join(UPLOADS, t.letterPath), name: t.letterName };
  }

  /**
   * One step of the approval chain. The caller's role decides which step they may act on:
   *   REGION (the student's own regional centre) -> STATE -> SUPER_ADMIN.
   * Approve moves the request on to the next role; "not approved" at ANY step ends it (status REJECTED) and records who did it.
   * Only the Super Admin's approval issues the TC (student -> 'TC Issued', seat released).
   */
  async review({ user, params, body }) {
    const { decision, remarks = '' } = body || {};
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError('Invalid decision');
    const note = String(remarks).trim();
    if (!note) throw new HttpError('Please write a message (required for both approve and not approve)');
    const mine = stageOfRole(user.role);
    if (!mine) throw new HttpError('Forbidden', 403);
    const id = +params.id || 0, ok = decision === 'APPROVED', who = TC_STAGES[mine].label;
    // scope(): a regional coordinator can only act on students of their own regional centre
    const [pre] = await db.select({ classLevel: S.classLevel }).from(S).where(and(eq(S.id, id), scope(user)));
    if (!pre) throw new HttpError('Not found', 404);
    await db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const s = await lockStudent(tx, id);
      const t = s && await latestTc(tx, s.id, true);
      if (!t) throw new HttpError('Not found', 404);
      if (t.status !== 'PENDING') throw new HttpError('This request was already decided', 409);        // a second reviewer lands here
      if (t.stage !== mine) throw new HttpError(t.stage === 'DONE' ? 'This request was already decided'
        : `This request is not waiting for your decision (it is with the ${TC_STAGES[t.stage]?.label ?? t.stage} now)`, 409);
      const now = new Date(), snap = { students: [], tcs: [{ id: t.id, before: TC_SNAP(t) }], vac: [] };

      if (mine !== 'ADMIN') {                                       // regional / state step: no admission data changes
        const cols = mine === 'REGION' ? { by: 'rcBy', at: 'rcAt', rm: 'rcRemarks' } : { by: 'scBy', at: 'scAt', rm: 'scRemarks' };
        const patch = { [cols.by]: user.username, [cols.at]: now, [cols.rm]: note,
          ...(ok ? { stage: mine === 'REGION' ? 'STATE' : 'ADMIN' } : { status: 'REJECTED', stage: 'DONE', rejectedLevel: mine }) };
        await tx.update(T).set(patch).where(eq(T.id, t.id));
        await audit(tx, { user }, { action: `TC_${mine === 'REGION' ? 'RC' : 'SC'}_${decision}`, regno: s.regno, studentId: s.id,
          message: ok ? `TC for ${s.name} approved by ${who}, sent to the ${mine === 'REGION' ? 'state coordinator' : 'super admin'}: ${note.slice(0, 80)}`
            : `TC for ${s.name} not approved by ${who}: ${note.slice(0, 80)}`, undo: snap });
        return;
      }

      // super admin step (final)
      if (ok && s.admitStatus !== 'Admitted') throw new HttpError('The student is no longer in Admitted status, so the TC cannot be approved');
      const vt = ok ? await lockVacancy(tx, s) : undefined;
      await tx.update(T).set({ status: decision, stage: 'DONE', rejectedLevel: ok ? null : 'ADMIN', reviewedBy: user.username, reviewedAt: now, reviewRemarks: note }).where(eq(T.id, t.id));
      if (ok) await tx.update(S).set({ admitStatus: 'TC Issued' }).where(eq(S.id, s.id));
      if (ok) {
        if (vt) await tx.update(V).set({ admitted: sql`greatest(${V.admitted} - 1, 0)`, vacancies: sql`${V.vacancies} + 1` }).where(eq(V.id, vt.id));
        await tx.insert(statusLogs).values({ studentId: s.id, field: 'admitStatus', oldValue: 'Admitted', newValue: 'TC Issued', remarks: note, changedBy: user.username });
      }
      await audit(tx, { user }, { action: `TC_${decision}`, regno: s.regno, message: `TC ${ok ? 'approved' : 'not approved'} by ${who} for ${s.name}: ${note.slice(0, 80)}`,
        undo: { students: [before(s)], tcs: snap.tcs, vac: ok && vt ? [{ id: vt.id, dAdmitted: vt.admitted > 0 ? -1 : 0, dVacancies: 1 }] : [] } });
    });
    return { ok: true };
  }
}
