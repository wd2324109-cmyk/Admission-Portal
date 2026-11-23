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
import { joinSeat, releaseSeat, seatTable, VACANT } from '../common/seats.js';
import { lockClass } from '../common/locks.js';
import { saveUpload } from '../common/upload.js';
import { getLetter, allLetters, putLetter, KINDS, STAGE_KINDS } from '../common/letters.js';
import { UPLOADS } from '../common/paths.js';
import { STATUS, GROUP_SQL, stateOf, groupOf, seatEffect, primary, statusColumns } from '../workflow/statuses.js';
import { planAction, availableActions, nextCodes, assertFresh, VALID_CODES } from '../workflow/transitions.js';

const SIZE = 25;
export const view = (row, cls, role, prev) => {
  const st = stateOf(row);
  if (prev) st.prev = prev;
  const next = role === 'SUPER_ADMIN' ? nextCodes(st).map(c => ({ code: c, label: STATUS[c].label })) : [];
  return { ...norm(row, cls), ...statusColumns(primary(st)), state: { code: st.code, tag2: st.tag2 }, group: groupOf(st), statusCode: primary(st), statusLabel: STATUS[primary(st)]?.label ?? 'Not listed', actions: availableActions(role, st), nextStatuses: next };
};

const SEAT_HOLDERS = ['1A', '2A', '7A'];
const up = c => sql`upper(trim(coalesce(${c}, '')))`, U = v => String(v ?? '').trim().toUpperCase();

// A TC Issued / joined student came from 3A or 3B; the TC reject step and the correction list need to know which.
async function joinedBefore(tx, cls, row) {
  if (stateOf(row).code !== '8A') return undefined;
  const [lg] = await tx.select().from(studentLog).where(and(eq(studentLog.class, row.class ?? String(cls)), eq(studentLog.emis, row.emis), eq(studentLog.updateStatusAfter, '8A'), inArray(studentLog.updateStatusBefore, ['3A', '3B']))).orderBy(sql`${studentLog.id} desc`).limit(1);
  return lg?.updateStatusBefore || '3A';
}

// A Not Willing student gave the seat up, so selecting a reconsidered student again needs a free seat in the same group.
async function requireOpenSeat(tx, cls, row) {
  const T = studentTable(cls), V = seatTable(cls);
  // Two logins selecting students of the same seat group must not both take the last seat: one at a time per group.
  await tx.execute(sql`select pg_advisory_xact_lock(${7303}::int, hashtext(${[cls, row.newDistcName, row.newUdiseCode, row.gender, row.medium, row.selectedCategory].map(U).join('|')}::text))`);
  const [{ vacant }] = await tx.select({ vacant: sql`count(*)::int` }).from(V).where(and(eq(V.classLevel, +cls), eq(V.vacancyStatus, VACANT), eq(up(V.newDistrict), U(row.newDistcName)), eq(up(V.newUdiseCode), U(row.newUdiseCode)),
    eq(up(V.gender), U(row.gender)), eq(up(V.medium), U(row.medium)), eq(up(V.community), U(row.selectedCategory))));
  const [{ held }] = await tx.select({ held: sql`count(*)::int` }).from(T).where(and(inArray(T.selectStatus, SEAT_HOLDERS), sql`${T.id} <> ${row.id}`, eq(up(T.newDistcName), U(row.newDistcName)), eq(up(T.newUdiseCode), U(row.newUdiseCode)),
    eq(up(T.gender), U(row.gender)), eq(up(T.medium), U(row.medium)), eq(up(T.selectedCategory), U(row.selectedCategory))));
  if (vacant - held < 1) throw new HttpError('No vacancy: every seat in this student\'s group is taken. Choose "Not Selected" or wait for a seat to be released.', 409);
}
const nul = v => (v === '' || v === undefined ? null : v);

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
  await logStudent(tx, cls, row, after, user);
  return after;
}

export const studentService = {
  async list({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), T = studentTable(cls), term = String(query.search || '').trim();
    const g = Object.hasOwn(GROUP_SQL, query.view) ? sql.raw(GROUP_SQL[query.view]) : undefined, page = Math.max(1, parseInt(query.page, 10) || 1);
    const q = term ? or(ilike(T.name, `%${likeEsc(term)}%`), sql`${T.emis}::text like ${likeEsc(term) + '%'}`) : undefined;
    const code = String(query.status || '').toUpperCase(), byCode = Object.hasOwn(STATUS, code) ? eq(T.selectStatus, code) : undefined;
    const where = and(scope(user, cls), g, byCode, q);
    const [rows, [{ n }]] = await Promise.all([
      db.select().from(T).where(where).orderBy(sql`${T.orank} asc nulls last`, asc(T.id)).limit(SIZE).offset((page - 1) * SIZE),
      db.select({ n: sql`count(*)::int` }).from(T).where(where)]);
    return { rows: rows.map(r => view(r, cls, user.role)), total: n, pages: Math.max(1, Math.ceil(n / SIZE)) };
  },
  async getById({ user, params }) {
    const cls = await requireClass(user, parseClass(params.cls)), row = await load(db, user, cls, params.id);
    const prev = await joinedBefore(db, cls, row);
    const logs = row.emis == null || user.role !== 'SUPER_ADMIN' ? [] : await db.select().from(studentLog).where(and(eq(studentLog.class, row.class ?? String(cls)), eq(studentLog.emis, row.emis))).orderBy(sql`${studentLog.id} desc`).limit(50);
    const letters = await allLetters(cls, row.id);
    return { ...view(row, cls, user.role, prev), letters, logs: logs.map(l => ({ id: l.id, before: l.updateStatusBefore, after: l.updateStatusAfter, by: l.updatedBy, at: l.updatedAt, tag: l.tag1, remarks: l.remark1 })) };
  },

  async act({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls));
    let saved = [];
    try {
      await db.transaction(async tx => {
        await lockClass(tx, cls);
        const row = await load(tx, user, cls, params.id, true), st = stateOf(row);

        assertFresh(body?.expect, st);
        const prev = await joinedBefore(tx, cls, row);
        if (prev) st.prev = prev;
        const plan = planAction(user.role, st, body?.action, body?.remarks);
        if (plan.after.code === '2A' && st.code === '1B') await requireOpenSeat(tx, cls, row);
        if (plan.needsLetter) {
          for (const k of plan.letters) if (!body?.letters?.[k]?.fileData) throw new HttpError(`Upload the ${KINDS[k]} (PDF, JPG or PNG, under 3 MB)`);
          for (const k of plan.letters) saved.push({ kind: k, ...(await saveUpload(body.letters[k].fileName, body.letters[k].fileData)) });
        }
        await commit(tx, user, cls, row, { ...statusColumns(plan.after.code), tag2: plan.after.tag2 || null, tag1: plan.tag1, remark1: plan.remark1 });
        for (const l of saved) await putLetter(cls, row.id, plan.tag1, l.kind, { fileName: l.name, stored: l.stored, by: user.username, at: new Date().toISOString() });
      });
    } catch (e) { for (const l of saved) await fs.unlink(path.join(UPLOADS, l.stored)).catch(() => {}); throw e; }
    return { ok: true };
  },

  async letter({ user, params, query }) {
    const stage = String(query?.stage || 'NOT_WILLING'), kind = String(query?.kind || (stage === 'NOT_WILLING' ? 'STUDENT' : STAGE_KINDS[stage]?.[0]));
    if (!Object.hasOwn(STAGE_KINDS, stage) || !STAGE_KINDS[stage].includes(kind)) throw new HttpError('Unknown letter');
    const cls = await requireClass(user, parseClass(params.cls)), row = await load(db, user, cls, params.id), l = await getLetter(cls, row.id, stage, kind);
    if (!l) throw new HttpError('This letter has not been uploaded', 404);
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
        tag2: code === '8B' ? 'TC-DONE' : code === '8A' ? (row.tag2 && row.tag2 !== 'TC-DONE' ? row.tag2 : 'TC-RC') : null });
    });
    return { ok: true };
  },
};
