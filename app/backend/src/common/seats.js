// The seat store: every seat is one row of Vacancies_9th / _10th.   VACANT = open,  JOINED = a student joined (Vacancy_Ref_no = his EMIS).
// A seat is taken when a student becomes 3A / 3B and given back when the TC is issued (8B) - see workflow/statuses.js.
// Every change is written to VACANCY_logs.
import { and, asc, eq, sql } from 'drizzle-orm';
import { vacancies9th, vacancies10th } from '../schema/index.js';
import { HttpError } from './http.js';
import { logSeat } from './logs.js';

export const VACANT = 'VACANT', JOINED = 'JOINED';
const TABLES = { 9: vacancies9th, 10: vacancies10th };
export const seatTable = cls => { const t = TABLES[+cls]; if (!t) throw new HttpError('Choose class 9 or 10'); return t; };
const up = c => sql`upper(trim(coalesce(${c}, '')))`;
const U = v => String(v ?? '').trim().toUpperCase();

// The seats of the cell this student was allotted to (district + school + gender + medium + the community he was selected under).
const cellRows = (tx, T, st, cls) => tx.select().from(T).where(and(eq(T.classLevel, +cls), eq(up(T.newDistrict), U(st.newDistcName)), eq(up(T.newUdiseCode), U(st.newUdiseCode)),
  eq(up(T.gender), U(st.gender)), eq(up(T.medium), U(st.medium)), eq(up(T.community), U(st.selectedCategory)))).orderBy(asc(T.id)).for('update');

/** A student joins: the first VACANT seat of his cell gets his EMIS. If the cell has no vacant seat, a seat is added (and logged) rather than blocking the admission. */
export async function joinSeat(tx, st, cls, user) {
  const T = seatTable(cls), rows = await cellRows(tx, T, st, cls);
  if (!rows.length) throw new HttpError('There is no vacancy row for this student\'s seat group, so the seat cannot be recorded. Import the vacancies first.', 409);
  const seat = rows.find(r => r.vacancyStatus === VACANT);
  let row, from;
  if (seat) { [row] = await tx.update(T).set({ vacancyRefNo: st.emis, vacancyStatus: JOINED, remarks: null }).where(eq(T.id, seat.id)).returning(); from = VACANT; }
  else {
    const b = rows[0];
    [row] = await tx.insert(T).values({ newDistrict: b.newDistrict, newUdiseType: b.newUdiseType, newUdiseCode: b.newUdiseCode, newSchoolName: b.newSchoolName, groupCode: b.groupCode, groupDesc: b.groupDesc,
      classLevel: b.classLevel, gender: b.gender, medium: b.medium, community: b.community, vacancyRefNo: st.emis, vacancyStatus: JOINED, remarks: 'Seat added: no vacant seat was left' }).returning();
    from = '(new seat)';
  }
  await logSeat(tx, row, from, JOINED, user);
}

/** The student's seat becomes VACANT again (TC issued, or a correction). */
export async function releaseSeat(tx, st, cls, user) {
  const T = seatTable(cls), rows = await cellRows(tx, T, st, cls);
  const mine = rows.find(r => r.vacancyStatus === JOINED && r.vacancyRefNo === st.emis);
  if (!mine) return;                                                 // nothing recorded for him: nothing to give back
  const [row] = await tx.update(T).set({ vacancyRefNo: null, vacancyStatus: VACANT, remarks: null }).where(eq(T.id, mine.id)).returning();
  await logSeat(tx, row, JOINED, VACANT, user, st.emis);
}

/** Seat rows for an imported vacancy row: `admitted` seats already filled before the portal (JOINED, no reference), then `vacancies` VACANT seats. */
export const seatRowsOf = c => {
  const base = { newDistrict: c.newDistrict, newUdiseType: c.newUdiseType ?? null, newUdiseCode: c.newUdiseCode ?? null, newSchoolName: c.newSchoolName ?? null,
    groupCode: c.groupCode ?? null, groupDesc: c.groupDesc ?? null, classLevel: +c.classLevel, gender: c.gender, medium: c.medium, community: c.community };
  return [...Array.from({ length: c.admitted || 0 }, () => ({ ...base, vacancyStatus: JOINED, remarks: 'Admitted before this portal' })),
    ...Array.from({ length: c.vacancies || 0 }, () => ({ ...base, vacancyStatus: VACANT }))];
};
