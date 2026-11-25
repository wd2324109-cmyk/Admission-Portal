import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { studentTable, parseClass, norm, pick } from '../common/studentStore.js';
import { seatTable } from '../common/seats.js';
import { logStudents } from '../common/logs.js';
import { lockClass } from '../common/locks.js';
import { stateOf, statusColumns, inListPool } from '../workflow/statuses.js';
import { planList } from '../workflow/allocation.js';
import { computeRanks, rankRemaining } from '../workflow/rank.js';
import { nextListNumber } from '../common/listNumber.js';
import { reconcileSeatRefs } from '../common/seatRef.js';

const started = rows => rows.some(r => r.selectStatus);

// Once lists have started the ranks of listed students never move. The students still waiting (a new import) are ranked from the rank after the last listed student.
const rankNewOnes = (rows, cls) => rankRemaining(rows.map(r => norm(r, cls)));
const writeRanks = async (tx, T, pairs) => {
  for (let i = 0; i < pairs.length; i += 500) {
    const part = pairs.slice(i, i + 500);
    await tx.execute(sql`update ${T} t set orank = v.r from (values ${sql.join(part.map(([id, r]) => sql`(${id}::int, ${r}::int)`), sql`, `)}) as v(id, r) where t.id = v.id`);
  }
};

export const listService = {
  async rank({ user, body }) {
    const cls = parseClass(body?.classLevel), T = studentTable(cls);
    return db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      const rows = await tx.select().from(T).orderBy(T.id).for('update');
      if (!rows.length) throw new HttpError('There are no students in this class yet. Import them first.', 409);
      const later = started(rows), pairs = later ? rankNewOnes(rows, cls) : [...computeRanks(rows.map(r => norm(r, cls)))];
      if (!pairs.length) throw new HttpError('There are no students waiting for a list, so there is nothing to rank. Import the new students first.', 409);
      await writeRanks(tx, T, pairs);
      return { ranked: pairs.length, onlyNew: later };
    });
  },

  async generate({ user, body }) {
    const cls = parseClass(body?.classLevel), T = studentTable(cls), V = seatTable(cls), preview = !!body?.preview;
    return db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      let rows = await tx.select().from(T).orderBy(T.id).for('update'); const seats = await tx.select().from(V).orderBy(V.id).for('update');
      if (!rows.length) throw new HttpError('There are no students in this class yet.', 409);
      if (!seats.length) throw new HttpError('There are no vacancies for this class yet. The DMS vacancy positions must be imported first.', 409);
      if (started(rows) && rows.some(r => !r.selectStatus && !Number.isInteger(r.orank))) { // a new list of students was imported: rank the new ones now, so no separate step is forgotten
        const pairs = rankNewOnes(rows, cls), got = new Map(pairs);
        await writeRanks(tx, T, pairs);
        rows = rows.map(r => (got.has(r.id) ? { ...r, orank: got.get(r.id) } : r));
      }
      const students = rows.map(r => norm(r, cls)), eligible = students.filter(s => inListPool(stateOf(s)));
      const unranked = eligible.filter(s => !Number.isInteger(s.orank)).length;
      if (unranked) throw new HttpError(`${unranked} students have no overall rank. Generate the overall rank first.`, 409);
      const plan = planList(students, seats, cls), summary = { listed: plan.totals.listed, openSeats: plan.totals.open, shortfall: plan.totals.shortfall,
        cells: plan.cells.filter(c => c.open > 0).map(c => ({ district: c.newDistrict, school: c.newSchoolName, gender: c.gender, medium: c.medium, community: c.community, open: c.open, listed: c.chosen, shortfall: c.shortfall })) };
      if (preview || !plan.assignments.length) return { ...summary, preview, listNumber: null };
      const listNumber = await nextListNumber(tx, cls), byId = new Map(rows.map(r => [r.id, r])), pairs = [];
      for (const a of plan.assignments) {
        const c = a.cell, [after] = await tx.update(T).set(pick(cls, { ...statusColumns('1A'), selectedCategory: c.community, newDistcName: c.newDistrict, newUdiseType: c.newUdiseType,
          newUdiseCode: c.newUdiseCode, newSchoolName: c.newSchoolName, tag1: 'LIST', remark1: `List ${listNumber}`, tag2: null })).where(eq(T.id, a.id)).returning();
        pairs.push([byId.get(a.id), after]);
      }
      // Each listed student now gets the reference of the exact seat (e.g. GT/Eng/Male/001) in remark2; the seat row carries the same reference in Group_code.
      await reconcileSeatRefs(tx, V, T, cls);
      const fresh = new Map();
      for (let i = 0; i < pairs.length; i += 1000) for (const r of await tx.select().from(T).where(inArray(T.id, pairs.slice(i, i + 1000).map(p => p[1].id)))) fresh.set(r.id, r);
      await logStudents(tx, cls, pairs.map(([b, a]) => [b, fresh.get(a.id) ?? a]), user);
      return { ...summary, preview: false, listNumber };
    });
  },
};
