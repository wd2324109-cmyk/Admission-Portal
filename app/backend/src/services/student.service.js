import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { studentLog } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { likeEsc } from '../common/query.js';
import { requireClass, scope, inScope } from '../common/access.js';
import { studentTable, parseClass, norm, pick } from '../common/studentStore.js';
import { logStudent } from '../common/logs.js';
import { joinSeat, releaseSeat } from '../common/seats.js';
import { lockClass } from '../common/locks.js';
import { STATUS, GROUP_SQL, stateOf, groupOf, seatEffect, primary, statusColumns } from '../workflow/statuses.js';
import { planAction, availableActions, VALID_CODES } from '../workflow/transitions.js';

const SIZE = 25;
export const view = (row, cls, role) => {
  const st = stateOf(row);
  return { ...norm(row, cls), ...statusColumns(primary(st)), state: st, group: groupOf(st), statusCode: primary(st), statusLabel: STATUS[primary(st)]?.label ?? 'Not listed', actions: availableActions(role, st) };
};
const nul = v => (v === '' || v === undefined ? null : v);

async function load(tx, user, cls, id, lock = false) {
  const T = studentTable(cls), q = tx.select().from(T).where(eq(T.id, +id || 0));
  const [row] = await (lock ? q.for('update') : q);
  if (!row || !inScope(user, row)) throw new HttpError('Student not found', 404);
  return row;
}
// Writes the change, moves the seat if the flowchart says so, and logs it. before/after are student rows.
async function commit(tx, user, cls, row, patch) {
  const T = studentTable(cls), [after] = await tx.update(T).set(pick(cls, patch)).where(eq(T.id, row.id)).returning();
  const eff = seatEffect(stateOf(row), stateOf(after));
  if (eff === 'JOIN') await joinSeat(tx, norm(after, cls), cls, user);
  if (eff === 'RELEASE') await releaseSeat(tx, norm(after, cls), cls, user);
  await logStudent(tx, cls, row, after, user);
  return after;
}

export const studentService = {
  async list({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), T = studentTable(cls), term = String(query.search || '').trim();
    const g = Object.hasOwn(GROUP_SQL, query.view) ? sql.raw(GROUP_SQL[query.view]) : undefined, page = Math.max(1, parseInt(query.page, 10) || 1);
    const q = term ? or(ilike(T.name, `%${likeEsc(term)}%`), sql`${T.emis}::text like ${likeEsc(term) + '%'}`) : undefined;
    const code = String(query.status || '').toUpperCase(), byCode = Object.hasOwn(STATUS, code) ? eq(T.selectStatus, code) : undefined;      // exact select_status filter; view=all (or none) = every status
    const where = and(scope(user, cls), g, byCode, q);
    const [rows, [{ n }]] = await Promise.all([
      db.select().from(T).where(where).orderBy(sql`${T.orank} asc nulls last`, asc(T.id)).limit(SIZE).offset((page - 1) * SIZE),
      db.select({ n: sql`count(*)::int` }).from(T).where(where)]);
    return { rows: rows.map(r => view(r, cls, user.role)), total: n, pages: Math.max(1, Math.ceil(n / SIZE)) };
  },
  async getById({ user, params }) {
    const cls = await requireClass(user, parseClass(params.cls)), row = await load(db, user, cls, params.id);
    const logs = row.emis == null ? [] : await db.select().from(studentLog).where(and(eq(studentLog.class, row.class ?? String(cls)), eq(studentLog.emis, row.emis))).orderBy(sql`${studentLog.id} desc`).limit(50);
    return { ...view(row, cls, user.role), logs: logs.map(l => ({ id: l.id, before: l.updateStatusBefore, after: l.updateStatusAfter, by: l.updatedBy, at: l.updatedAt, tag: l.tag1, remarks: l.remark1 })) };
  },
  // One step of the flowchart on one student (see workflow/transitions.js).
  async act({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls));
    await db.transaction(async tx => {
      await lockClass(tx, cls);
      const row = await load(tx, user, cls, params.id, true), plan = planAction(user.role, stateOf(row), body?.action, body?.remarks);
      await commit(tx, user, cls, row, { ...statusColumns(plan.after.code), tag2: plan.after.tag2 || null, tag1: plan.tag1, remark1: plan.remark1 });
    });
    return { ok: true };
  },
  // Correction by the super admin: put the student at any status, with a reason. The seat and the logs follow.
  async override({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls)), code = String(body?.code ?? ''), note = String(body?.remarks || '').trim();
    if (!VALID_CODES.includes(code)) throw new HttpError('Unknown status code');
    if (!note) throw new HttpError('Remarks are required for a correction');
    await db.transaction(async tx => {
      await lockClass(tx, cls);
      const row = await load(tx, user, cls, params.id, true);
      if (code && !(row.newDistcName && row.selectedCategory)) throw new HttpError('This student has not been allotted to a school by a list yet', 409);
      await commit(tx, user, cls, row, { ...statusColumns(code), tag1: 'OVERRIDE', remark1: note,
        tag2: code === '8B' ? 'TC-DONE' : code === '8A' ? (row.tag2 && row.tag2 !== 'TC-DONE' ? row.tag2 : 'TC-RC') : null,
        ...(!code ? { selectedCategory: null, newDistcName: null, newUdiseType: null, newUdiseCode: null, newSchoolName: null } : {}) });
    });
    return { ok: true };
  },
};
