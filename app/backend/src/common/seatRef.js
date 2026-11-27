import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { seatCellKey, studentCellKey } from '../workflow/allocation.js';

// A seat reference looks like  GT/Eng/Male/001  (community / medium / gender / running number inside the school's seat group).
//
// Where it is kept (no new columns; the 10 tables stay exactly as in the document):
//   Vacancies_9th / _10th   -> "Group_code"  (class_level is an integer used by every seat query, so it cannot hold text)
//   Students_master_9th     -> remark2       (tag2 already carries the TC stage: TC-RC / TC-SRC / TC-DONE)
// A student shows the reference of the seat he or she is allotted to (Waiting, Selected, Not Joined - Pending) or occupies (Joined, TC-Waiting).
// Any other status clears it. Students_master_10th has no free column, so class 10 students carry no reference.
const clean = v => String(v ?? '').trim();
const up = c => sql`upper(trim(coalesce(${c}, '')))`;
const U = v => clean(v).toUpperCase();

const medium3 = m => { const s = clean(m); return s ? s[0].toUpperCase() + s.slice(1, 3).toLowerCase() : ''; };
const sexOf = g => ({ BOY: 'Male', GIRL: 'Female' })[U(g)] || clean(g);

export const REF_RE = /^[A-Z][A-Z-]*\/[A-Za-z]{1,3}\/[A-Za-z]+\/\d{3,}$/;
export const isRef = v => REF_RE.test(clean(v));
export const seatRef = (r, n) => [U(r.community), medium3(r.medium), sexOf(r.gender), String(n).padStart(3, '0')].join('/');

const HOLD = ['1A', '2A', '7A'], JOIN = ['3A', '3B', '8A', '8B', '8C', '8Z'];
const rankOf = s => (Number.isInteger(s.orank) ? s.orank : Number.MAX_SAFE_INTEGER);

const writeColumn = async (tx, T, column, pairs) => {
  for (let i = 0; i < pairs.length; i += 500) {
    const part = pairs.slice(i, i + 500);
    await tx.execute(sql`update ${T} t set ${sql.raw(`"${column}"`)} = v.r from (values ${sql.join(part.map(([id, r]) => sql`(${id}::int, ${r}::text)`), sql`, `)}) as v(id, r) where t.id = v.id`);
  }
};

// Gives every seat row its reference. The running number follows the row id inside the seat group, which is the order the Vacancies screen has always used.
// Returns the rows (with the reference filled in) in id order.
export async function stampSeatRefs(tx, V, cls, only) {
  const where = only ? and(eq(up(V.newDistrict), U(only.district)), eq(up(V.newUdiseCode), U(only.udise))) : undefined;
  const rows = await tx.select().from(V).where(where).orderBy(asc(V.id)), no = new Map(), todo = [];
  for (const r of rows) {
    const k = seatCellKey(r, cls), n = (no.get(k) ?? 0) + 1; no.set(k, n);
    const ref = seatRef(r, n);
    if (r.groupCode !== ref) { todo.push([r.id, ref]); r.groupCode = ref; }
  }
  await writeColumn(tx, V, 'Group_code', todo);
  return rows;
}

// Makes the student side agree with the seat side. Safe to run any number of times; it only writes rows whose value is wrong.
// `only` = { district, udise } limits the work to one school (used after a single status change).
export async function reconcileSeatRefs(tx, V, T, cls, only) {
  if (!('remark2' in T)) return 0;
  const seats = await stampSeatRefs(tx, V, cls, only);
  const stWhere = only ? and(isNotNull(T.emis), eq(up(T.newDistcName), U(only.district)), eq(up(T.newUdiseCode), U(only.udise))) : isNotNull(T.emis);
  const studs = await tx.select().from(T).where(stWhere).orderBy(asc(T.id)).for('update');

  const seatsBy = new Map(), studsBy = new Map();
  for (const r of seats) { const k = seatCellKey(r, cls); (seatsBy.get(k) ?? seatsBy.set(k, []).get(k)).push(r); }
  for (const s of studs) { const k = studentCellKey(s, cls); (studsBy.get(k) ?? studsBy.set(k, []).get(k)).push(s); }

  const want = new Map();
  for (const [k, list] of studsBy) {
    const cell = seatsBy.get(k) ?? [], taken = new Set();
    for (const x of cell) if (U(x.vacancyStatus) !== 'VACANT') taken.add(x.id);
    for (const s of list) {
      if (!JOIN.includes(clean(s.selectStatus))) continue;
      const seat = cell.find(x => U(x.vacancyStatus) === 'JOINED' && x.vacancyRefNo === s.emis);
      if (seat) want.set(s.id, seat.groupCode);
    }
    const free = new Map(cell.filter(x => !taken.has(x.id)).map(x => [x.groupCode, x]));
    const holders = list.filter(s => HOLD.includes(clean(s.selectStatus))).sort((a, b) => rankOf(a) - rankOf(b) || a.id - b.id), waiting = [];
    for (const s of holders) { if (isRef(s.remark2) && free.has(s.remark2)) { want.set(s.id, s.remark2); free.delete(s.remark2); } else waiting.push(s); }
    const spare = [...free.keys()];
    for (const s of waiting) want.set(s.id, spare.shift() ?? null);
  }

  const todo = [];
  for (const s of studs) {
    const now = clean(s.remark2) || null, next = want.get(s.id) ?? null;
    if (next === now) continue;
    if (next === null && !isRef(now)) continue; // never wipe text that is not a seat reference
    todo.push([s.id, next]);
  }
  await writeColumn(tx, T, 'remark2', todo);
  return todo.length;
}
