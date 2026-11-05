import { and, asc, eq, inArray } from 'drizzle-orm';
import { vacancies9th, vacancies10th, vacancies11th, vacancyLogs as L } from '../schema/index.js';
import { emisRef } from './emis.js';

// Seat store: every seat is a row in Vacancies_9th / Vacancies_10th / Vacancies_11th (see schema/vacancyTables.schema.js).
//   JOINED   - a student has joined this seat; Vacancy_Ref_no is that student's EMIS
//   VACANT   - open seat
//   SHORTFALL- open seat that the last selection found no student for
// All changes to seats go through this file, and each one is written to VACANCY_logs.
export const JOINED = 'JOINED', VACANT = 'VACANT', SHORTFALL = 'SHORTFALL';
export const PRE_PORTAL = 'Admitted before this portal';       // a JOINED seat that has no student on the list (from the vacancy sheet's "Admitted" count)

const TABLES = { 9: vacancies9th, 10: vacancies10th, 11: vacancies11th };
export const seatTable = cls => { const t = TABLES[+cls]; if (!t) throw new Error(`There is no vacancy table for class ${cls}`); return t; };

export const cellOfStudent = st => ({ regionalCentre: st.regionalCentre, classLevel: +st.classLevel, gender: st.gender, medium: st.medium, community: st.selectedCategory });
const cellWhere = (T, c) => and(eq(T.newDistrict, c.regionalCentre), eq(T.classLevel, +c.classLevel), eq(T.gender, c.gender), eq(T.medium, c.medium), eq(T.community, c.community));
const keyOf = r => [r.newDistrict, r.classLevel, r.gender, r.medium, r.community].join('|');
const lockedCellRows = (tx, T, c) => tx.select().from(T).where(cellWhere(T, c)).orderBy(asc(T.id)).for('update');

/** A cell (regional centre, class, gender, medium, community) with its seats counted: admitted = JOINED seats, vacancies = all other seats. */
export function summarize(rows) {
  const r = rows[0], open = rows.filter(x => x.vacancyStatus !== JOINED);
  return { regionalCentre: r.newDistrict, classLevel: r.classLevel, gender: r.gender, medium: r.medium, community: r.community,
    admitted: rows.length - open.length, vacancies: open.length, shortfall: open.filter(x => x.vacancyStatus === SHORTFALL).length, rows };
}
export function aggregate(rows) {
  const m = new Map();
  for (const r of rows) (m.get(keyOf(r)) ?? m.set(keyOf(r), []).get(keyOf(r))).push(r);
  return [...m.values()].map(summarize);
}
/** Same numbers the old vacancy list showed: filled = admitted + seats a student is reserved for, balance = seats nobody could be found for. */
export const cellView = c => ({ regionalCentre: c.regionalCentre, classLevel: c.classLevel, gender: c.gender, medium: c.medium, community: c.community,
  admitted: c.admitted, vacancies: c.vacancies, filled: c.admitted + c.vacancies - c.shortfall, balance: c.shortfall, status: c.shortfall > 0 ? 'SHORTFALL' : 'OK' });

/** All seats of one class, grouped by cell, locked for the rest of the transaction (used by selection). */
export async function listCells(tx, cls) {
  const T = seatTable(cls);
  return aggregate(await tx.select().from(T).orderBy(asc(T.id)).for('update'));
}
/** The seats of the cell this (selected) student belongs to, locked; undefined when the cell has no seats. */
export async function lockCellSeats(tx, st) {
  const T = seatTable(st.classLevel), rows = await lockedCellRows(tx, T, cellOfStudent(st));
  return rows.length ? summarize(rows) : undefined;
}

const logRow = (row, from, to, by, ref = row.vacancyRefNo) => ({ newDistrict: row.newDistrict, newUdiseType: row.newUdiseType, newUdiseCode: row.newUdiseCode,
  newSchoolName: row.newSchoolName, groupCode: row.groupCode, groupDesc: row.groupDesc, classLevel: row.classLevel, gender: row.gender, medium: row.medium,
  community: row.community, vacancyRefNo: ref, vacancyStatus: to, updateStatusBefore: from, updateStatusAfter: to, updatedBy: by });
const snap = r => ({ ref: r.vacancyRefNo, status: r.vacancyStatus, remarks: r.remarks });

/** A student joins: the first open seat of their cell gets their EMIS. Returns the undo records (empty if the cell has no seats at all). */
export async function joinSeat(tx, st, user) {
  const T = seatTable(st.classLevel), rows = await lockedCellRows(tx, T, cellOfStudent(st));
  if (!rows.length) return [];
  const ref = emisRef(st.emisNo), remarks = ref === null && st.emisNo ? `EMIS ${st.emisNo}` : null;
  // a student who was reserved a seat is not a "shortfall", so a plain VACANT seat is used first
  const seat = rows.find(r => r.vacancyStatus === VACANT) ?? rows.find(r => r.vacancyStatus === SHORTFALL);
  let row, undo, from;
  if (seat) {
    [row] = await tx.update(T).set({ vacancyRefNo: ref, vacancyStatus: JOINED, remarks }).where(eq(T.id, seat.id)).returning();
    undo = { cls: +st.classLevel, id: seat.id, before: snap(seat) }; from = seat.vacancyStatus;
  } else {                                                            // every seat is taken already: the cell grows by one seat, as the old counts allowed
    const b = rows[0];
    [row] = await tx.insert(T).values({ newDistrict: b.newDistrict, newUdiseType: b.newUdiseType, newUdiseCode: b.newUdiseCode, newSchoolName: b.newSchoolName,
      groupCode: b.groupCode, groupDesc: b.groupDesc, classLevel: b.classLevel, gender: b.gender, medium: b.medium, community: b.community,
      vacancyRefNo: ref, vacancyStatus: JOINED, remarks }).returning();
    undo = { cls: +st.classLevel, id: row.id, created: true }; from = '(new seat)';
  }
  await tx.insert(L).values(logRow(row, from, JOINED, user.username));
  return [undo];
}

/** A student's seat becomes open again (TC issued, admission revoked). Returns the undo records. */
export async function releaseSeat(tx, st, user) {
  const T = seatTable(st.classLevel), rows = await lockedCellRows(tx, T, cellOfStudent(st));
  if (!rows.length) return [];
  const ref = emisRef(st.emisNo), note = `EMIS ${st.emisNo}`, joined = rows.filter(r => r.vacancyStatus === JOINED);
  const mine = (ref !== null && joined.find(r => r.vacancyRefNo === ref)) || joined.find(r => r.remarks === note)
    || joined.find(r => r.vacancyRefNo === null && !(r.remarks || '').startsWith('EMIS '));       // last resort: a seat filled before the portal
  let row, undo;
  if (mine) {
    [row] = await tx.update(T).set({ vacancyRefNo: null, vacancyStatus: VACANT, remarks: null }).where(eq(T.id, mine.id)).returning();
    undo = { cls: +st.classLevel, id: mine.id, before: snap(mine) };
  } else {                                                            // nothing recorded as joined: the cell still gains an open seat, as before
    const b = rows[0];
    [row] = await tx.insert(T).values({ newDistrict: b.newDistrict, newUdiseType: b.newUdiseType, newUdiseCode: b.newUdiseCode, newSchoolName: b.newSchoolName,
      groupCode: b.groupCode, groupDesc: b.groupDesc, classLevel: b.classLevel, gender: b.gender, medium: b.medium, community: b.community,
      vacancyStatus: VACANT }).returning();
    undo = { cls: +st.classLevel, id: row.id, created: true };
  }
  await tx.insert(L).values(logRow(row, mine ? JOINED : '(new seat)', VACANT, user.username, ref ?? mine?.vacancyRefNo ?? null));
  return [undo];
}

/** Mark exactly `balance` of the open seats of a cell as SHORTFALL (no student found) and the rest as VACANT. */
export async function setShortfall(tx, cls, cell, balance, user) {
  const T = seatTable(cls), rows = cell.rows ?? await lockedCellRows(tx, T, cell);
  const open = rows.filter(r => r.vacancyStatus !== JOINED).sort((a, b) => a.id - b.id);
  const want = Math.max(0, Math.min(+balance || 0, open.length)), short = new Set(open.slice(open.length - want).map(r => r.id));
  const changes = open.map(r => ({ r, to: short.has(r.id) ? SHORTFALL : VACANT })).filter(x => x.to !== x.r.vacancyStatus);
  for (const to of [SHORTFALL, VACANT]) {
    const ids = changes.filter(x => x.to === to).map(x => x.r.id);
    if (ids.length) await tx.update(T).set({ vacancyStatus: to }).where(inArray(T.id, ids));
  }
  if (changes.length) await tx.insert(L).values(changes.map(x => logRow(x.r, x.r.vacancyStatus, x.to, user.username)));
}

/** Undo what joinSeat / releaseSeat did. */
export async function restoreSeats(tx, entries, user) {
  for (const e of [...(entries || [])].reverse()) {
    const T = seatTable(e.cls), [cur] = await tx.select().from(T).where(eq(T.id, e.id)).for('update');
    if (!cur) continue;
    if (e.created) { await tx.delete(T).where(eq(T.id, e.id)); await tx.insert(L).values(logRow(cur, cur.vacancyStatus, '(seat removed)', user.username)); continue; }
    const [row] = await tx.update(T).set({ vacancyRefNo: e.before.ref, vacancyStatus: e.before.status, remarks: e.before.remarks }).where(eq(T.id, e.id)).returning();
    await tx.insert(L).values(logRow(row, cur.vacancyStatus, row.vacancyStatus, user.username, cur.vacancyRefNo ?? row.vacancyRefNo));
  }
}

/** Seat rows for a vacancy sheet row: `admitted` seats already filled before the portal, then `vacancies` open seats. */
export function seatRowsOf(c) {
  const base = { newDistrict: c.regionalCentre, classLevel: +c.classLevel, gender: c.gender, medium: c.medium, community: c.community };
  return [...Array.from({ length: c.admitted || 0 }, () => ({ ...base, vacancyStatus: JOINED, remarks: PRE_PORTAL })),
    ...Array.from({ length: c.vacancies || 0 }, () => ({ ...base, vacancyStatus: VACANT }))];
}
