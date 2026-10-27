import { and, eq, ne, ilike, or, sql, desc, asc, getTableColumns } from 'drizzle-orm';
import { students as S, vacancies as V, statusLogs, auditLogs as A } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { before, audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { scope, classFilter, page1, likeEsc, cellW, CLEAN } from '../../common/query.js';
import { planRevert } from '../domain/revert.js';
import { REQUIRED_DOCS } from '../document.service.js';
import { lockClass, lockStudent, lockCell, lockVacancy } from '../../common/locks.js';
import { StudentService } from '../student.service.js';

const { documents: _documents, tc: _tc, ...listCols } = getTableColumns(S);

export class StudentServiceImpl extends StudentService {
  async list({ user, query }) {
    const { class: c, view = 'all', search = '' } = query, size = 25, page = page1(query.page);                                                                 
    if (view === 'pending') throw new HttpError('The Pending view has been removed', 400);
    const VIEWS = {
      selected: sql`${S.selectStatus} <> '' and ${S.admitStatus} = ''`,                                                                                           
      joined: eq(S.admitStatus, 'Admitted'), admitted: eq(S.admitStatus, 'Admitted'),
      notjoined: sql`((${S.selectStatus} = '' and ${S.admitStatus} = '' and ${S.willingStatus} = 'UNWILLING') or ${S.admitStatus} like 'Not Admitted%')`,                                                              
      tc: sql`${S.admitStatus} like 'TC Issued%'`,
    };
    const viewW = VIEWS[view];
    const term = String(search).trim();
    const q = term ? or(ilike(S.name, `%${likeEsc(term)}%`), ilike(S.emisNo, `%${likeEsc(term)}%`)) : undefined;                                                                                                          
    const docsOpen = query.docsOpen ? sql`(select count(*) from jsonb_each(${S.documents}) e where e.key in (${sql.join(REQUIRED_DOCS.map(t => sql`${t}`), sql`, `)}) and e.value->>'status' = 'VERIFIED') < ${REQUIRED_DOCS.length}` : undefined;
    const where = and(scope(user), classFilter(c), viewW, q, docsOpen);
    const [rows, [{ n }]] = await Promise.all([
      db.select(listCols).from(S).where(where).orderBy(desc(S.total), asc(S.orank)).limit(size).offset((page - 1) * size),
      db.select({ n: sql`count(*)::int` }).from(S).where(where)]);
    return ({ rows, total: n, pages: Math.max(1, Math.ceil(n / size)) });
  }
  async getById({ user, params }) {
    const [s] = await db.select().from(S).where(and(eq(S.id, +params.id || 0), scope(user)));
    if (!s) throw new HttpError('Not found', 404);
    const logs = await db.select().from(statusLogs).where(eq(statusLogs.studentId, s.id)).orderBy(desc(statusLogs.changedAt));
    return ({ ...s, logs });
  }
  async update({ user, params, body }) {
    const id = +params.id || 0;
    const [pre] = await db.select({ classLevel: S.classLevel }).from(S).where(and(eq(S.id, id), scope(user)));
    if (!pre) throw new HttpError('Not found', 404);
    return db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const s = await lockStudent(tx, id);                       // authoritative copy; concurrent editors wait here
      if (!s) throw new HttpError('Not found', 404);
      const act = body?.action;
      if (act === 'SELECT') {
        if (s.selectStatus || s.admitStatus || s.willingStatus === 'UNWILLING') throw new HttpError('Only students with no selection or willing status yet can be marked Selected');
        const patch = { selectStatus: 'Selected-Phase-1', selectedCategory: s.selectedCategory || (['BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'].includes(s.community) ? s.community : 'GT') };
        const label = 'Selected';
        await tx.update(S).set(patch).where(eq(S.id, s.id));
        await tx.insert(statusLogs).values({ studentId: s.id, field: 'status', oldValue: 'Pending', newValue: label, changedBy: user.username });
        await audit(tx, { user }, { action: act, regno: s.regno, message: `${s.name} (Class ${s.classLevel}): ${label}`, undo: { students: [before(s)] } });
        return { ok: true };
      }
      if (!s.selectStatus) throw new HttpError('Student has not been selected yet');
      if (s.admitStatus === 'Admitted') throw new HttpError('Student is already admitted; the decision is final');
      if (s.admitStatus.startsWith('TC Issued')) throw new HttpError('A TC has been issued for this student');
      if (s.admitStatus.startsWith('Not Admitted')) throw new HttpError('Only the super admin can revert a Not Admitted student');
      if (s.verificationStatus === 'ACCEPTED') throw new HttpError('Unwillingness was accepted; the seat has been released');
      const { admitStatus, willingStatus, unwillingLetter } = body || {}, patch = {};
      if (willingStatus !== undefined) {
        if (!['WILLING', 'UNWILLING'].includes(willingStatus)) throw new HttpError('Invalid willing status');
        const letter = (unwillingLetter ?? s.unwillingLetter ?? '').trim();
        if (willingStatus === 'UNWILLING' && !letter) throw new HttpError('Unwilling letter is required');
        if (s.verificationStatus === 'REJECTED') throw new HttpError('Unwillingness was rejected by the super admin; the decision is final');
        Object.assign(patch, { willingStatus, unwillingLetter: willingStatus === 'UNWILLING' ? letter : null });
      }
      if (admitStatus !== undefined) {
        if (!['Admitted', 'Not Admitted'].includes(admitStatus)) throw new HttpError('Invalid admission status');
        const unwilling = (patch.willingStatus ?? s.willingStatus) === 'UNWILLING';
        if (admitStatus === 'Admitted' && unwilling && s.verificationStatus !== 'REJECTED')
          throw new HttpError('Cannot admit an unwilling student until the unwillingness is verified and rejected');
        patch.admitStatus = admitStatus;
      }
      if (!Object.keys(patch).length) throw new HttpError('Nothing to update');
      const vv = patch.admitStatus === 'Admitted' ? await lockVacancy(tx, s) : undefined;   // seat counter is locked before it is changed
      await tx.update(S).set(patch).where(eq(S.id, s.id));
      if (patch.admitStatus === 'Admitted' && vv)
        await tx.update(V).set({ admitted: sql`${V.admitted} + 1`, vacancies: sql`greatest(${V.vacancies} - 1, 0)` }).where(eq(V.id, vv.id));
      for (const f of ['admitStatus', 'willingStatus']) if (patch[f] !== undefined && patch[f] !== s[f])
        await tx.insert(statusLogs).values({ studentId: s.id, field: f, oldValue: s[f], newValue: patch[f], changedBy: user.username });
      const action = patch.admitStatus === 'Admitted' ? 'ADMIT' : patch.admitStatus === 'Not Admitted' ? 'NOT_ADMIT' : patch.willingStatus === 'UNWILLING' ? 'UNWILLING' : 'WILLING';
      await audit(tx, { user }, { action, regno: s.regno, message: `${s.name} (Class ${s.classLevel}, ${s.selectedCategory || '-'}): ${patch.admitStatus ?? patch.willingStatus}`,
        undo: { students: [before(s)], vac: vv && patch.admitStatus === 'Admitted' ? [{ id: vv.id, dAdmitted: 1, dVacancies: vv.vacancies > 0 ? -1 : 0 }] : [] } });
      return { ok: true };
    });
  }
  async revert({ user, params, body }) {
    const remarks = String(body?.remarks || '').trim();
    if (!remarks) throw new HttpError('Remarks are required to revert');
    const id = +params.id || 0;
    const [pre] = await db.select().from(S).where(eq(S.id, id));
    if (!pre) throw new HttpError('Not found', 404);
    return db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      // Lock the student AND everyone competing for the same seats in one ordered statement, then the vacancy row.
      const cell = await lockCell(tx, pre);
      const a = cell.find(x => x.id === id);
      if (!a) throw new HttpError('Not found', 404);
      if (!a.admitStatus.startsWith('Not Admitted')) throw new HttpError('Only "Not Admitted" students can be reverted', 409);
      if (a.selectedCategory !== pre.selectedCategory) throw new HttpError('This student was changed by someone else. Reload and try again.', 409);
      const holders = cell.filter(x => x.id !== id);
      const vac = await lockVacancy(tx, a);
      const plan = planRevert(a, vac, holders);
      if (plan.action === 'none') throw new HttpError(`No vacancy: the ${a.selectedCategory} seats for ${a.gender} / ${a.medium} in ${a.regionalCentre} (Class ${a.classLevel}) are full, and no lower-ranked student without admission can make room.`, 409);
      const log = (st, field, oldValue, newValue, note) => tx.insert(statusLogs).values({ studentId: st.id, field, oldValue, newValue, remarks: note, changedBy: user.username });
      if (plan.bump) {
        await tx.update(S).set(CLEAN).where(eq(S.id, plan.bump.id));
        await log(plan.bump, 'selection', plan.bump.selectStatus, 'Removed', `Seat given to reverted student ${a.regno} (higher rank). ${remarks}`);
      }
      const reset = a.verificationStatus === 'ACCEPTED' ? { willingStatus: 'WILLING', unwillingLetter: null, verificationStatus: 'PENDING', verificationRemarks: null } : {};
      await tx.update(S).set({ admitStatus: '', ...reset }).where(eq(S.id, a.id));
      await log(a, 'admitStatus', a.admitStatus, '(selected, pending)', remarks);
      if (vac) {
        const pending = holders.length - (plan.bump ? 1 : 0) + 1, balance = Math.max(0, vac.vacancies - pending);
        await tx.update(V).set({ filled: vac.admitted + pending, balance, status: balance > 0 ? 'SHORTFALL' : 'OK' }).where(eq(V.id, vac.id));
      }
      await audit(tx, { user }, { action: 'REVERT', regno: a.regno, message: `${a.name} taken back for admission` + (plan.bump ? `; seat taken from ${plan.bump.name} (${plan.bump.regno})` : ' (free seat)'), undo: { students: [a, plan.bump].filter(Boolean).map(before) } });
      return { ok: true, restored: a.regno, removed: plan.bump?.regno ?? null, removedName: plan.bump?.name ?? null };
    });
  }
  async revertTc({ user, params, body }) {
    const remarks = String(body?.remarks || '').trim();
    if (!remarks) throw new HttpError('Remarks are required to revert a TC', 400);
    const id = +params.id || 0;
    const [pre] = await db.select().from(S).where(eq(S.id, id));
    if (!pre) throw new HttpError('Not found', 404);
    return db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const cell = await lockCell(tx, pre);
      const a = cell.find(x => x.id === id);
      if (!a) throw new HttpError('Not found', 404);
      if (!a.admitStatus.startsWith('TC Issued')) throw new HttpError('Only students with a TC issued can be reverted', 400);
      const holders = cell.filter(x => x.id !== id);
      const vac = await lockVacancy(tx, a);
      if ((vac?.vacancies ?? 0) - holders.length < 1)
        throw new HttpError(`No vacancy: the ${a.selectedCategory} seats for ${a.gender} / ${a.medium} in ${a.regionalCentre} (Class ${a.classLevel}) are full, so this TC cannot be reverted.`, 409);
      await tx.update(S).set({ admitStatus: 'Admitted', ...(a.tc?.status === 'APPROVED' ? { tc: { ...a.tc, status: 'CANCELLED' } } : {}) }).where(eq(S.id, a.id));
      await tx.update(V).set({ admitted: sql`${V.admitted} + 1`, vacancies: sql`greatest(${V.vacancies} - 1, 0)` }).where(eq(V.id, vac.id));
      await tx.insert(statusLogs).values({ studentId: a.id, field: 'admitStatus', oldValue: a.admitStatus, newValue: 'Admitted', remarks, changedBy: user.username });
      await audit(tx, { user }, { action: 'REVERT_TC', regno: a.regno, message: `${a.name}: TC reverted, admitted again - ${remarks}`,
        undo: { students: [before(a, ['tc'])], vac: [{ id: vac.id, dAdmitted: 1, dVacancies: vac.vacancies > 0 ? -1 : 0 }] } });
      return { ok: true };
    });
  }
  async revokeAdmission({ user, params, body }) {
    const remarks = String(body?.remarks || '').trim();
    if (!remarks) throw new HttpError('Remarks are required to revoke an admission', 400);
    const id = +params.id || 0;
    const [pre] = await db.select({ classLevel: S.classLevel }).from(S).where(eq(S.id, id));
    if (!pre) throw new HttpError('Not found', 404);
    return db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const s = await lockStudent(tx, id);
      if (!s) throw new HttpError('Not found', 404);
      if (s.admitStatus !== 'Admitted') throw new HttpError('Only admitted students can have their admission revoked', 400);
      if (['PENDING', 'APPROVED'].includes(s.tc?.status)) throw new HttpError('This student has a pending or approved TC request', 409);
      const vv = await lockVacancy(tx, s);
      await tx.update(S).set({ admitStatus: '' }).where(eq(S.id, s.id));
      if (vv) await tx.update(V).set({ admitted: sql`greatest(${V.admitted} - 1, 0)`, vacancies: sql`${V.vacancies} + 1` }).where(eq(V.id, vv.id));
      await tx.insert(statusLogs).values({ studentId: s.id, field: 'admitStatus', oldValue: 'Admitted', newValue: '(selected, pending)', remarks, changedBy: user.username });
      await audit(tx, { user }, { action: 'REVOKE_ADMISSION', regno: s.regno, message: `${s.name}: admission revoked, vacancy restored - ${remarks}`,
        undo: { students: [before(s)], vac: vv ? [{ id: vv.id, dAdmitted: vv.admitted > 0 ? -1 : 0, dVacancies: 1 }] : [] } });
      return { ok: true };
    });
  }
}
