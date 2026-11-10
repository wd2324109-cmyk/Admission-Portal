import { and, eq, ne, ilike, or, sql, desc, asc, notInArray } from 'drizzle-orm';
import { students as S, statusLogs, auditLogs as A, tcRequests as T } from '../../schema/index.js';
import { joinSeat, releaseSeat, lockCellSeats, setShortfall } from '../../common/seats.js';
import { db } from '../../db/index.js';
import { before, audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { scope, classFilter, page1, likeEsc, CLEAN } from '../../common/query.js';
import { planRevert } from '../domain/revert.js';
import { REQUIRED_DOCS } from '../document.service.js';
import { idsAllVerified } from '../../common/docstore.js';
import { latestTc, TC_SNAP } from '../../common/tc.js';
import { lockClass, lockStudent, lockCell } from '../../common/locks.js';
import { StudentService } from '../student.service.js';

export class StudentServiceImpl extends StudentService {
  async list({ user, query }) {
    const { class: c, view = 'all', search = '' } = query, size = 25, page = page1(query.page);                                                                 
    const VIEWS = {
      pending: sql`${S.selectStatus} = '' and ${S.admitStatus} = '' and ${S.willingStatus} is distinct from 'UNWILLING'`,
      selected: sql`${S.selectStatus} <> '' and ${S.admitStatus} = ''`,                                                                                           
      joined: eq(S.admitStatus, 'Admitted'), admitted: eq(S.admitStatus, 'Admitted'),
      notjoined: sql`((${S.selectStatus} = '' and ${S.admitStatus} = '' and ${S.willingStatus} = 'UNWILLING') or ${S.admitStatus} like 'Not Admitted%')`,                                                              
      tc: sql`${S.admitStatus} like 'TC Issued%'`,
    };
    const viewW = Object.hasOwn(VIEWS, view) ? VIEWS[view] : undefined;      // own keys only: '__proto__' / 'constructor' are not views
    const term = String(search).trim();
    const q = term ? or(ilike(S.name, `%${likeEsc(term)}%`), ilike(S.emisNo, `%${likeEsc(term)}%`)) : undefined;                                                                                                          

    const done = query.docsOpen ? await idsAllVerified(REQUIRED_DOCS) : [];
    const docsOpen = done.length ? notInArray(S.id, done) : undefined;
    const where = and(scope(user), classFilter(c), viewW, q, docsOpen);
    const [rows, [{ n }]] = await Promise.all([
      db.select().from(S).where(where).orderBy(desc(S.total), asc(S.orank)).limit(size).offset((page - 1) * size),
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
      const s = await lockStudent(tx, id);
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
      await tx.update(S).set(patch).where(eq(S.id, s.id));
      const seats = patch.admitStatus === 'Admitted' ? await joinSeat(tx, s, user) : [];       // the student's EMIS goes on a seat of their cell
      for (const f of ['admitStatus', 'willingStatus']) if (patch[f] !== undefined && patch[f] !== s[f])
        await tx.insert(statusLogs).values({ studentId: s.id, field: f, oldValue: s[f], newValue: patch[f], changedBy: user.username });
      const action = patch.admitStatus === 'Admitted' ? 'ADMIT' : patch.admitStatus === 'Not Admitted' ? 'NOT_ADMIT' : patch.willingStatus === 'UNWILLING' ? 'UNWILLING' : 'WILLING';
      await audit(tx, { user }, { action, regno: s.regno, message: `${s.name} (Class ${s.classLevel}, ${s.selectedCategory || '-'}): ${patch.admitStatus ?? patch.willingStatus}`,
        undo: { students: [before(s)], seats } });
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

      const cell = await lockCell(tx, pre);
      const a = cell.find(x => x.id === id);
      if (!a) throw new HttpError('Not found', 404);
      if (!a.admitStatus.startsWith('Not Admitted')) throw new HttpError('Only "Not Admitted" students can be reverted', 409);
      if (a.selectedCategory !== pre.selectedCategory) throw new HttpError('This student was changed by someone else. Reload and try again.', 409);
      const holders = cell.filter(x => x.id !== id);
      const vac = await lockCellSeats(tx, a);
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
        await setShortfall(tx, a.classLevel, vac, balance, user);
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
      const vac = await lockCellSeats(tx, a);
      if ((vac?.vacancies ?? 0) - holders.length < 1)
        throw new HttpError(`No vacancy: the ${a.selectedCategory} seats for ${a.gender} / ${a.medium} in ${a.regionalCentre} (Class ${a.classLevel}) are full, so this TC cannot be reverted.`, 409);
      const tc = await latestTc(tx, a.id, true);
      await tx.update(S).set({ admitStatus: 'Admitted' }).where(eq(S.id, a.id));
      if (tc?.status === 'APPROVED') await tx.update(T).set({ status: 'CANCELLED' }).where(eq(T.id, tc.id));
      const seats = await joinSeat(tx, a, user);
      await tx.insert(statusLogs).values({ studentId: a.id, field: 'admitStatus', oldValue: a.admitStatus, newValue: 'Admitted', remarks, changedBy: user.username });
      await audit(tx, { user }, { action: 'REVERT_TC', regno: a.regno, message: `${a.name}: TC reverted, admitted again - ${remarks}`,
        undo: { students: [before(a)], tcs: tc?.status === 'APPROVED' ? [{ id: tc.id, before: TC_SNAP(tc) }] : [], seats } });
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
      if (['PENDING', 'APPROVED'].includes((await latestTc(tx, s.id))?.status)) throw new HttpError('This student has a pending or approved TC request', 409);
      await tx.update(S).set({ admitStatus: '' }).where(eq(S.id, s.id));
      const seats = await releaseSeat(tx, s, user);                                            // the seat is open again
      await tx.insert(statusLogs).values({ studentId: s.id, field: 'admitStatus', oldValue: 'Admitted', newValue: '(selected, pending)', remarks, changedBy: user.username });
      await audit(tx, { user }, { action: 'REVOKE_ADMISSION', regno: s.regno, message: `${s.name}: admission revoked, vacancy restored - ${remarks}`,
        undo: { students: [before(s)], seats } });
      return { ok: true };
    });
  }
}
