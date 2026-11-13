// Section 2 (overall rank) and Sections 3 / 5 (generate the student list) - the work of the State Enrollment Team.
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { studentTable, parseClass, norm, pick } from '../common/studentStore.js';
import { seatTable } from '../common/seats.js';
import { logStudents } from '../common/logs.js';
import { lockClass } from '../common/locks.js';
import { stateOf, statusColumns } from '../workflow/statuses.js';
import { planList } from '../workflow/allocation.js';
import { computeRanks } from '../workflow/rank.js';

const started = rows => rows.some(r => r.selectStatus);

export const listService = {
  async rank({ user, body }) {
    const cls = parseClass(body?.classLevel), T = studentTable(cls);
    return db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      const rows = await tx.select().from(T).orderBy(T.id).for('update');
      if (!rows.length) throw new HttpError('There are no students in this class yet. Import them first.', 409);
      if (started(rows)) throw new HttpError('Lists have already been generated for this class; the overall rank can no longer change.', 409);
      const ranks = computeRanks(rows.map(r => norm(r, cls)));
      const pairs = [...ranks];
      for (let i = 0; i < pairs.length; i += 500) {
        const part = pairs.slice(i, i + 500);
        await tx.execute(sql`update ${T} t set orank = v.r from (values ${sql.join(part.map(([id, r]) => sql`(${id}::int, ${r}::int)`), sql`, `)}) as v(id, r) where t.id = v.id`);
      }
      return { ranked: rows.length };
    });
  },

  // Generates the next student list for a class. Run it as often as needed: each run fills only the balance (see workflow/allocation.js).
  async generate({ user, body }) {
    const cls = parseClass(body?.classLevel), T = studentTable(cls), V = seatTable(cls), preview = !!body?.preview;
    return db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      const rows = await tx.select().from(T).orderBy(T.id).for('update'), seats = await tx.select().from(V).orderBy(V.id).for('update');
      if (!rows.length) throw new HttpError('There are no students in this class yet.', 409);
      if (!seats.length) throw new HttpError('There are no vacancies for this class yet. The DMS vacancy positions must be imported first.', 409);
      const students = rows.map(r => norm(r, cls)), eligible = students.filter(s => { const st = stateOf(s); return !st.code || st.code === '1B'; });
      const unranked = eligible.filter(s => !Number.isInteger(s.orank)).length;
      if (unranked) throw new HttpError(`${unranked} students have no overall rank. Generate the overall rank first.`, 409);
      const plan = planList(students, seats, cls), summary = { listed: plan.totals.listed, openSeats: plan.totals.open, shortfall: plan.totals.shortfall,
        cells: plan.cells.filter(c => c.open > 0).map(c => ({ district: c.newDistrict, school: c.newSchoolName, gender: c.gender, medium: c.medium, community: c.community, open: c.open, listed: c.chosen, shortfall: c.shortfall })) };
      if (preview || !plan.assignments.length) return { ...summary, preview, listNumber: null };
      const [{ n }] = (await tx.execute(sql`select coalesce(max(substring(remark1 from '^List ([0-9]+)')::int), 0) as n from "Student_LOG" where "class" = ${String(cls)} and tag1 = 'LIST'`)).rows;
      const listNumber = (+n || 0) + 1, byId = new Map(rows.map(r => [r.id, r])), pairs = [];
      for (const a of plan.assignments) {
        const c = a.cell, [after] = await tx.update(T).set(pick(cls, { ...statusColumns('1A'), selectedCategory: c.community, newDistcName: c.newDistrict, newUdiseType: c.newUdiseType,
          newUdiseCode: c.newUdiseCode, newSchoolName: c.newSchoolName, tag1: 'LIST', remark1: `List ${listNumber}`, tag2: null })).where(eq(T.id, a.id)).returning();
        pairs.push([byId.get(a.id), after]);
      }
      await logStudents(tx, cls, pairs, user);
      return { ...summary, preview: false, listNumber };
    });
  },
};
