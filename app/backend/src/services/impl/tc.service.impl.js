import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { students as S, vacancies as V, statusLogs } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { HttpError } from '../../common/http.js';
import { scope, cellW } from '../../common/query.js';
import { audit, before } from '../../common/audit.js';
import { UPLOADS } from '../../common/paths.js';
import { saveUpload } from '../../common/upload.js';
import { lockClass, lockStudent, lockVacancy } from '../../common/locks.js';
import { TcService } from '../tc.service.js';

                                                                                                                         
const view = s => ({ id: s.id, studentId: s.id, reason: s.tc.reason, letterName: s.tc.letterName, status: s.tc.status, requestedBy: s.tc.requestedBy, requestedAt: s.tc.requestedAt,
  reviewedBy: s.tc.reviewedBy ?? null, reviewedAt: s.tc.reviewedAt ?? null, reviewRemarks: s.tc.remarks ?? null,
  regno: s.regno, name: s.name, classLevel: s.classLevel, district: s.district, gender: s.gender, community: s.community });

export class TcServiceImpl extends TcService {
  async list({ user, query }) {
    const rows = await db.select().from(S).where(and(scope(user), sql`${S.tc} is not null`, query.status ? sql`${S.tc}->>'status' = ${String(query.status)}` : undefined));
    return rows.map(view).sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  }

  async raise({ user, body }) {
    const { studentId, reason = '', fileName, fileData } = body || {};
    const [pre] = await db.select().from(S).where(and(eq(S.id, +studentId || 0), scope(user)));
    if (!pre) throw new HttpError('Student not found in your district', 404);
    const check = s => {
      if (s.admitStatus !== 'Admitted') throw new HttpError('A TC can be requested only for admitted students');
      if (!String(reason).trim()) throw new HttpError('Reason is required');
      if (['PENDING', 'APPROVED'].includes(s.tc?.status)) throw new HttpError('This student already has a pending or approved TC request', 409);
    };
    check(pre);
    const { stored, name } = await saveUpload(fileName, fileData);
    try {
      await db.transaction(async tx => {
        await lockClass(tx, pre.classLevel);
        const s = await lockStudent(tx, pre.id);
        check(s);                                            // re-check under the lock: a double-click cannot raise two requests
        await tx.update(S).set({ tc: { status: 'PENDING', reason: String(reason).trim(), letterName: name, letterPath: stored, requestedBy: user.username, requestedAt: new Date().toISOString() } }).where(eq(S.id, s.id));
        await audit(tx, { user }, { action: 'TC_RAISE', regno: s.regno, studentId: s.id, message: `TC requested for ${s.name}: ${String(reason).trim().slice(0, 80)}` });
      });
    } catch (e) { await fs.unlink(path.join(UPLOADS, stored)).catch(() => {}); throw e; }   // no orphan file when the request is refused
    return { ok: true };
  }

  async letter({ user, params }) {
    const [s] = await db.select().from(S).where(and(eq(S.id, +params.id || 0), scope(user)));
    if (!s?.tc) throw new HttpError('Not found', 404);
    return { file: path.join(UPLOADS, s.tc.letterPath), name: s.tc.letterName };
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
      if (!s?.tc) throw new HttpError('Not found', 404);
      if (s.tc.status !== 'PENDING') throw new HttpError('This request was already reviewed');          // second reviewer lands here
      if (ok && s.admitStatus !== 'Admitted') throw new HttpError('The student is no longer in Admitted status, so the TC cannot be approved');
      const vt = ok ? await lockVacancy(tx, s) : undefined;
      await tx.update(S).set({ tc: { ...s.tc, status: decision, reviewedBy: user.username, reviewedAt: new Date().toISOString(), remarks: note }, ...(ok ? { admitStatus: 'TC Issued' } : {}) }).where(eq(S.id, s.id));
      if (ok) {
        if (vt) await tx.update(V).set({ admitted: sql`greatest(${V.admitted} - 1, 0)`, vacancies: sql`${V.vacancies} + 1` }).where(eq(V.id, vt.id));
        await tx.insert(statusLogs).values({ studentId: s.id, field: 'admitStatus', oldValue: 'Admitted', newValue: 'TC Issued', remarks: note, changedBy: user.username });
      }
      await audit(tx, { user }, { action: `TC_${decision}`, regno: s.regno, message: `TC ${ok ? 'approved' : 'not approved'} for ${s.name}: ${note.slice(0, 80)}`,
        undo: { students: [before(s, ['tc'])], vac: ok && vt ? [{ id: vt.id, dAdmitted: vt.admitted > 0 ? -1 : 0, dVacancies: 1 }] : [] } });
    });
    return { ok: true };
  }
}
