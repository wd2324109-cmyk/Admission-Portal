import fs from 'node:fs/promises';
import path from 'node:path';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { studentLog } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { likeEsc } from '../common/query.js';
import { requireClass, scope, inScope } from '../common/access.js';
import { studentTable, parseClass, norm, pick } from '../common/studentStore.js';
import { logStudent } from '../common/logs.js';
import { joinSeat, releaseSeat, seatTable } from '../common/seats.js';
import { reconcileSeatRefs, isRef } from '../common/seatRef.js';
import { lockClass } from '../common/locks.js';
import { uploadFile } from '../common/bucket.js';
import { saveFile, latestFile } from '../common/fileStore.js';
import { getLetter, allLetters, putLetter, KINDS, STAGE_KINDS } from '../common/letters.js';
import { UPLOADS } from '../common/paths.js';
import { STATUS, GROUP_SQL, stateOf, groupOf, seatEffect, primary, statusColumns, tcTag2 } from '../workflow/statuses.js';
import { planAction, availableActions, nextCodes, assertFresh, VALID_CODES } from '../workflow/transitions.js';
import { TC_STEP_KEYS, tcThread } from '../common/tcRemarks.js';

const SIZE = 25;
export const view = (row, cls, role, prev) => {
  const st = stateOf(row);
  if (prev) st.prev = prev;
  const next = role === 'SUPER_ADMIN' ? nextCodes(st).map(c => ({ code: c, label: STATUS[c].label })) : [];
  return { ...norm(row, cls), ...statusColumns(primary(st)), state: { code: st.code, tag2: st.tag2, tag1: st.tag1 }, group: groupOf(st), vacancyRef: isRef(row.remark2) ? row.remark2 : null, statusCode: primary(st), statusLabel: STATUS[primary(st)]?.label ?? 'Not listed', actions: availableActions(role, st), nextStatuses: next };
};

const U = v => String(v ?? '').trim().toUpperCase();

// A student in the TC process came from 3A or 3B; withdrawing a rejected TC request and the correction list need to know which.
async function joinedBefore(tx, cls, row) {
  if (!['8A', '8B', '8C', '8Z'].includes(stateOf(row).code)) return undefined;
  const [lg] = await tx.select().from(studentLog).where(and(eq(studentLog.class, row.class ?? String(cls)), eq(studentLog.emis, row.emis), eq(studentLog.updateStatusAfter, '8A'), inArray(studentLog.updateStatusBefore, ['3A', '3B']))).orderBy(sql`${studentLog.id} desc`).limit(1);
  return lg?.updateStatusBefore || '3A';
}

async function load(tx, user, cls, id, lock = false) {
  const T = studentTable(cls), q = tx.select().from(T).where(eq(T.id, +id || 0));
  const [row] = await (lock ? q.for('update') : q);
  if (!row || !inScope(user, row)) throw new HttpError('Student not found', 404);
  return row;
}

async function commit(tx, user, cls, row, patch) {
  const T = studentTable(cls), [after] = await tx.update(T).set(pick(cls, patch)).where(eq(T.id, row.id)).returning();
  const eff = seatEffect(stateOf(row), stateOf(after));
  if (eff === 'JOIN') await joinSeat(tx, norm(after, cls), cls, user);
  if (eff === 'RELEASE') await releaseSeat(tx, norm(after, cls), cls, user);
  // Keep the seat reference (remark2) in step with the new status: it shows while the student holds or occupies a seat and is cleared otherwise.
  let cur = after;
  if (after.newDistcName) {
    await reconcileSeatRefs(tx, seatTable(cls), T, cls, { district: after.newDistcName, udise: after.newUdiseCode });
    [cur = after] = await tx.select().from(T).where(eq(T.id, row.id));
  }
  await logStudent(tx, cls, row, cur, user);
  return cur;
}

export const studentService = {
  async list({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), T = studentTable(cls), term = String(query.search || '').trim();
    if (query.view === 'notlisted' && user.role !== 'SUPER_ADMIN') throw new HttpError('Only the super admin can view the Not listed students', 403);
    const g = Object.hasOwn(GROUP_SQL, query.view) ? sql.raw(GROUP_SQL[query.view]) : undefined, page = Math.max(1, parseInt(query.page, 10) || 1);
    const q = term ? or(ilike(T.name, `%${likeEsc(term)}%`), sql`${T.emis}::text like ${likeEsc(term) + '%'}`) : undefined;
    const code = String(query.status || '').toUpperCase(), byCode = Object.hasOwn(STATUS, code) ? eq(T.selectStatus, code) : undefined;
    // STATE and SUPER_ADMIN see every district, so they get a district filter (by the student's home district).
    const multi = user.role === 'STATE' || user.role === 'SUPER_ADMIN', dist = multi ? String(query.district || '').trim().toUpperCase() : '';
    const byDist = dist ? sql`upper(trim(${T.district})) = ${dist}` : undefined;
    const where = and(scope(user, cls), g, byCode, byDist, q);
    const [rows, [{ n }], names] = await Promise.all([
      db.select().from(T).where(where).orderBy(sql`${T.orank} asc nulls last`, asc(T.id)).limit(SIZE).offset((page - 1) * SIZE),
      db.select({ n: sql`count(*)::int` }).from(T).where(where),
      multi ? db.selectDistinct({ d: sql`upper(trim(${T.district}))` }).from(T).where(sql`trim(coalesce(${T.district}, '')) <> ''`) : Promise.resolve(null)]);
    return { rows: rows.map(r => view(r, cls, user.role)), total: n, pages: Math.max(1, Math.ceil(n / SIZE)), ...(names ? { districts: names.map(r => r.d).sort() } : {}) };
  },
  async getById({ user, params }) {
    const cls = await requireClass(user, parseClass(params.cls)), row = await load(db, user, cls, params.id);
    const prev = await joinedBefore(db, cls, row);
    const logs = row.emis == null || user.role !== 'SUPER_ADMIN' ? [] : await db.select().from(studentLog).where(and(eq(studentLog.class, row.class ?? String(cls)), eq(studentLog.emis, row.emis))).orderBy(sql`${studentLog.id} desc`).limit(50);
    const letters = await allLetters(cls, row.id);
    // Every role that can open the student sees all the remarks given on the TC request; the history list below stays for the super admin only.
    const tcLogs = row.emis == null || !stateOf(row).code.startsWith('8') && !prev ? [] : await db.select().from(studentLog).where(and(eq(studentLog.class, row.class ?? String(cls)), eq(studentLog.emis, row.emis), inArray(studentLog.tag1, TC_STEP_KEYS))).orderBy(sql`${studentLog.id} asc`);
    return { ...view(row, cls, user.role, prev), letters, tcRemarks: tcThread(tcLogs, user.role), logs: logs.map(l => ({ id: l.id, before: l.updateStatusBefore, after: l.updateStatusAfter, by: l.updatedBy, at: l.updatedAt, tag: l.tag1, remarks: l.remark1 })) };
  },

  async act({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls));
    const saved = [];
    await db.transaction(async tx => {
      await lockClass(tx, cls);
      const row = await load(tx, user, cls, params.id, true), st = stateOf(row);

      assertFresh(body?.expect, st);
      const prev = await joinedBefore(tx, cls, row);
      if (prev) st.prev = prev;
      const plan = planAction(user.role, st, body?.action, body?.remarks);
      if (plan.needsLetter) {
        // A resubmitted TC request may keep a letter that is already on file; every other step needs each letter uploaded.
        for (const k of plan.letters) if (!body?.letters?.[k]?.fileData && !(plan.keepLetters && await getLetter(cls, row.id, plan.letterStage, k))) throw new HttpError(`Upload the ${KINDS[k]} (PDF, JPG or PNG, under 3 MB)`);
        for (const k of plan.letters) if (body?.letters?.[k]?.fileData) saved.push({ kind: k, ...(await uploadFile(body.letters[k].fileName, body.letters[k].fileData)) });
      }
      await commit(tx, user, cls, row, { ...statusColumns(plan.after.code), tag2: plan.after.tag2 || null, tag1: plan.tag1, remark1: plan.remark1 });
      for (const l of saved) {
        await saveFile(tx, cls, { studentId: row.id, emis: row.emis, group: 'LETTER', type: `${plan.letterStage}-${l.kind}`, name: l.name, url: l.url, by: user.username });
        await putLetter(cls, row.id, plan.letterStage, l.kind, { fileName: l.name, by: user.username, at: new Date().toISOString() });
      }
    });
    return { ok: true };
  },

  async letter({ user, params, query }) {
    const stage = String(query?.stage || 'NOT_WILLING'), kind = String(query?.kind || (stage === 'NOT_WILLING' ? 'STUDENT' : STAGE_KINDS[stage]?.[0]));
    if (!Object.hasOwn(STAGE_KINDS, stage) || !STAGE_KINDS[stage].includes(kind)) throw new HttpError('Unknown letter');
    const cls = await requireClass(user, parseClass(params.cls)), row = await load(db, user, cls, params.id), l = await getLetter(cls, row.id, stage, kind);
    if (!l) throw new HttpError('This letter has not been uploaded', 404);
    const f = await latestFile(db, cls, row.id, 'LETTER', `${stage}-${kind}`);
    if (f) return { url: f.fileUrl, name: f.fileName };
    return { file: path.join(UPLOADS, l.stored), name: l.fileName };
  },

  async override({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls)), code = String(body?.code ?? ''), note = String(body?.remarks || '').trim();
    if (!VALID_CODES.includes(code)) throw new HttpError('Unknown status code');
    if (!note) throw new HttpError('Remarks are required for a correction');
    await db.transaction(async tx => {
      await lockClass(tx, cls);
      const row = await load(tx, user, cls, params.id, true);
      const st = stateOf(row), prev = await joinedBefore(tx, cls, row);
      assertFresh(body?.expect, st);
      if (prev) st.prev = prev;
      if (!code || !nextCodes(st).includes(code)) throw new HttpError(`Correction can only move this student to the next status: ${nextCodes(st).map(c => STATUS[c].label).join(' or ') || 'none (this is the last status)'}`, 409);
      if (!(row.newDistcName && row.selectedCategory)) throw new HttpError('This student has not been allotted to a school by a list yet', 409);
      await commit(tx, user, cls, row, { ...statusColumns(code), tag1: 'OVERRIDE', remark1: note,
        tag2: tcTag2(code) || null });
    });
    return { ok: true };
  },
};
