import { and, asc, eq, sql } from 'drizzle-orm';
import { vacancies9th, vacancies10th } from '../schema/index.js';
import { HttpError } from './http.js';
import { logSeat } from './logs.js';

export const VACANT = 'VACANT', JOINED = 'JOINED';
const TABLES = { 9: vacancies9th, 10: vacancies10th };
export const seatTable = cls => { const t = TABLES[+cls]; if (!t) throw new HttpError('Choose class 9 or 10'); return t; };
const up = c => sql`upper(trim(coalesce(${c}, '')))`;
const U = v => String(v ?? '').trim().toUpperCase();

const cellRows = (tx, T, st, cls) => tx.select().from(T).where(and(eq(T.classLevel, +cls), eq(up(T.newDistrict), U(st.newDistcName)), eq(up(T.newUdiseCode), U(st.newUdiseCode)),
  eq(up(T.gender), U(st.gender)), eq(up(T.medium), U(st.medium)), eq(up(T.community), U(st.selectedCategory)))).orderBy(asc(T.id)).for('update');

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

export async function releaseSeat(tx, st, cls, user) {
  const T = seatTable(cls), rows = await cellRows(tx, T, st, cls);
  const mine = rows.find(r => r.vacancyStatus === JOINED && r.vacancyRefNo === st.emis);
  if (!mine) return;
  const [row] = await tx.update(T).set({ vacancyRefNo: null, vacancyStatus: VACANT, remarks: null }).where(eq(T.id, mine.id)).returning();
  await logSeat(tx, row, JOINED, VACANT, user, st.emis);
}

export const seatRowsOf = c => {
  const base = { newDistrict: c.newDistrict, newUdiseType: c.newUdiseType ?? null, newUdiseCode: c.newUdiseCode ?? null, newSchoolName: c.newSchoolName ?? null,
    groupCode: c.groupCode ?? null, groupDesc: c.groupDesc ?? null, classLevel: +c.classLevel, gender: c.gender, medium: c.medium, community: c.community };
  return [...Array.from({ length: c.admitted || 0 }, () => ({ ...base, vacancyStatus: JOINED, remarks: 'Admitted before this portal' })),
    ...Array.from({ length: c.vacancies || 0 }, () => ({ ...base, vacancyStatus: VACANT }))];
};
