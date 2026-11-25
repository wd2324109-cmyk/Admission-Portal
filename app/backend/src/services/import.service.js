import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { readSheet, chunks } from '../common/excel.js';
import { studentTable, parseClass, pick } from '../common/studentStore.js';
import { seatTable, seatRowsOf } from '../common/seats.js';
import { reconcileSeatRefs } from '../common/seatRef.js';
import { lockClass } from '../common/locks.js';
import { mapStudentRow, mapVacancyRow } from '../workflow/importMap.js';
import { districtsOf } from '../common/access.js';
import { nextListNumber } from '../common/listNumber.js';
import { logStudents } from '../common/logs.js';

const sheet = body => { try { const rows = readSheet(body?.fileData); if (!rows.length) throw new Error(); return rows; } catch { throw new HttpError('Could not read the file. Upload a valid .xlsx file with at least one row'); } };
const brief = rejected => ({ rejected: rejected.slice(0, 20), rejectedCount: rejected.length });
const anyStatus = (tx, T) => tx.select({ n: sql`count(*)::int` }).from(T).where(sql`coalesce(${T.selectStatus},'') <> ''`).then(r => r[0].n);

export const importService = {

  async students({ user, body }) {
    const cls = parseClass(body?.classLevel), T = studentTable(cls), rows = sheet(body), good = [], rejected = [], seen = new Set();
    rows.forEach((r, i) => { const m = mapStudentRow(r, cls); if (m.error) rejected.push({ row: i + 2, reason: m.error }); else if (seen.has(m.value.emis)) rejected.push({ row: i + 2, reason: `duplicate EMIS ${m.value.emis} in the file` }); else { seen.add(m.value.emis); good.push(m.value); } });
    if (!good.length) throw new HttpError('No valid rows found', 400, brief(rejected));
    let inserted = 0, listNumber = null;
    await db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      if (body.replace) { if (await anyStatus(tx, T)) throw new HttpError('Lists have already been generated for this class; the students can no longer be replaced.', 409); await tx.delete(T); }
      const have = new Set((await tx.select({ e: T.emis }).from(T)).map(r => r.e));
      const fresh = good.filter(s => !have.has(s.emis));
      if (fresh.some(s => s.selectStatus)) listNumber = await nextListNumber(tx, cls);
      for (const c of chunks(fresh)) {
        const added = await tx.insert(T).values(c.map(v => pick(cls, v.selectStatus && !v.tag1 ? { ...v, tag1: 'LIST', remark1: v.remark1 || `List ${listNumber}` } : v))).returning();
        inserted += added.length;
        const listed = added.filter(r => r.selectStatus);
        if (listed.length) await logStudents(tx, cls, listed.map(r => [null, r]), user);
      }
      if (listNumber) await reconcileSeatRefs(tx, seatTable(cls), T, cls); // students imported already listed get their seat reference
    });
    return { imported: inserted, skippedExisting: good.length - inserted, listNumber, ...brief(rejected) };
  },

  async vacancies({ user, body }) {
    const cls = parseClass(body?.classLevel), V = seatTable(cls), T = studentTable(cls), rows = sheet(body), mode = body?.mode === 'append' ? 'append' : 'replace';
    const mine = user.role === 'DISTRICT' ? districtsOf(user) : null, good = [], rejected = [];
    rows.forEach((r, i) => { const m = mapVacancyRow(r, cls); if (m.error) rejected.push({ row: i + 2, reason: m.error }); else if (mine && !mine.includes(m.value.newDistrict)) rejected.push({ row: i + 2, reason: `District ${m.value.newDistrict} is not yours` }); else good.push(m.value); });
    if (!good.length) throw new HttpError('No valid rows found', 400, brief(rejected));
    const newUsers = [];
    await db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      if (mode === 'replace') {
        if (await anyStatus(tx, T)) throw new HttpError('Lists have already been generated for this class. Use "Add seats" to furnish more vacancies.', 409);
        await tx.delete(V);
      }
      for (const c of chunks(good.flatMap(seatRowsOf), 500)) await tx.insert(V).values(c);
      await reconcileSeatRefs(tx, V, T, cls); // every seat row gets its reference (Group_code); allotted students get theirs (remark2)
      // DMS accounts are not created here any more: every DMS signs in with MSMS and gets class access on the first sign-in.
    });
    return { imported: good.length, seats: good.reduce((n, c) => n + c.admitted + c.vacancies, 0), mode, newUsers, ...brief(rejected) };
  },
};
