import { asc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requireClass, classesOf, seatScope } from '../common/access.js';
import { seatTable } from '../common/seats.js';
import { studentTable, parseClass, norm } from '../common/studentStore.js';
import { holdsSeat, stateOf } from '../workflow/statuses.js';
import { buildCells, studentCellKey, seatCellKey } from '../workflow/allocation.js';
import { seatRef, isRef } from '../common/seatRef.js';

async function loadClass(user, cls) {
  const V = seatTable(cls), T = studentTable(cls);
  const [seats, students] = await Promise.all([db.select().from(V).where(seatScope(user, V)).orderBy(asc(V.id)),
    db.select().from(T).where(sql`${T.selectStatus} in ('1A','2A','7A')`)]);
  return { seats, students: students.map(r => norm(r, cls)), T };
}

export const vacancyRef = seatRef;

export const vacancyService = {

  async cells({ user, query }) {
    const classes = query.class ? [await requireClass(user, parseClass(query.class))] : await classesOf(user), out = [];
    for (const cls of classes) {
      const { seats, students } = await loadClass(user, cls);
      out.push(...buildCells(students, seats, cls).map(c => ({ classLevel: cls, district: c.newDistrict, udiseCode: c.newUdiseCode, school: c.newSchoolName, gender: c.gender, medium: c.medium, community: c.community,
        seats: c.seats, joined: c.joined, held: c.held, open: c.open })));
    }
    return out;
  },

  async seats({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), { seats, students, T } = await loadClass(user, cls);
    const joinedStudents = seats.some(s => s.vacancyRefNo != null) ? await db.select().from(T).where(sql`${T.emis} in (select "Vacancy_Ref_no" from ${seatTable(cls)} where "Vacancy_Ref_no" is not null)`) : [];
    const byEmis = new Map(joinedStudents.map(r => [r.emis, r]));
    const holders = new Map();
    for (const s of students.filter(s => holdsSeat(stateOf(s)))) (holders.get(studentCellKey(s, cls)) ?? holders.set(studentCellKey(s, cls), []).get(studentCellKey(s, cls))).push(s);
    for (const l of holders.values()) l.sort((a, b) => (a.orank ?? 1e12) - (b.orank ?? 1e12));
    // A holder with a stored reference (remark2) owns exactly that seat; cells with no stored references fall back to rank order.
    const byRef = new Map(), stored = new Set();
    for (const s of students.filter(s => holdsSeat(stateOf(s)) && isRef(s.remark2))) { byRef.set(studentCellKey(s, cls) + '|' + s.remark2, s); stored.add(studentCellKey(s, cls)); }
    const used = new Map(), no = new Map(), rows = [];
    for (const r of seats) {
      const k = seatCellKey(r, cls), n = (no.get(k) ?? 0) + 1; no.set(k, n);
      const ref = isRef(r.groupCode) ? r.groupCode : seatRef(r, n);
      let status = r.vacancyStatus === 'JOINED' ? 'JOINED' : 'VACANT', who = null;
      if (status === 'JOINED') { const j = byEmis.get(r.vacancyRefNo); who = j ? { id: j.id, name: j.name, emis: j.emis } : null; }
      else {
        const i = used.get(k) ?? 0, h = stored.has(k) ? byRef.get(k + '|' + ref) : holders.get(k)?.[i];
        if (h) { status = 'RESERVED'; who = { id: h.id, name: h.name, emis: h.emis }; used.set(k, i + 1); }
      }
      rows.push({ seatNo: n, refNo: ref, district: r.newDistrict, school: r.newSchoolName, gender: r.gender, medium: r.medium, community: r.community, status, who, remarks: r.remarks });
    }
    // STATE and SUPER_ADMIN see every district, so they get a district filter.
    const multi = user.role === 'STATE' || user.role === 'SUPER_ADMIN', dist = multi ? String(query.district || '').trim().toUpperCase() : '';
    const districts = multi ? [...new Set(rows.map(r => String(r.district ?? '').trim().toUpperCase()).filter(Boolean))].sort() : undefined;
    if (dist) for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i].district ?? '').trim().toUpperCase() !== dist) rows.splice(i, 1);
    const term = String(query.search || '').trim().toLowerCase(), want = ['JOINED', 'RESERVED', 'VACANT'].includes(query.status) ? query.status : '';
    const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});
    const list = rows.filter(r => (!want || r.status === want) && (!term || (r.who && (r.who.name.toLowerCase().includes(term) || String(r.who.emis).startsWith(term))))), page = Math.max(1, parseInt(query.page, 10) || 1);
    return { rows: list.slice((page - 1) * 50, page * 50), pages: Math.max(1, Math.ceil(list.length / 50)), counts, ...(districts ? { districts } : {}) };
  },
};
