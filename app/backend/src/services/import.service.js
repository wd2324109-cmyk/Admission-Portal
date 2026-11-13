// Four Excel sheets only: 9th_master_sheet and 10th_master_sheet (students), 9th_vacancy_sheet and 10th_vacancy_sheet (vacancy positions).
// The class comes from the sheet the user chose (classLevel 9 or 10). Class 11 and the separate DGE / Kalai Thiruvizha sheets are not used.
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { users } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { readSheet, chunks, randPw, slug } from '../common/excel.js';
import { studentTable, parseClass, pick } from '../common/studentStore.js';
import { seatTable, seatRowsOf } from '../common/seats.js';
import { lockClass } from '../common/locks.js';
import { setAccess } from './user.service.js';
import { mapStudentRow, mapVacancyRow } from '../workflow/importMap.js';
import { districtsOf } from '../common/access.js';

const sheet = body => { try { const rows = readSheet(body?.fileData); if (!rows.length) throw new Error(); return rows; } catch { throw new HttpError('Could not read the file. Upload a valid .xlsx file with at least one row'); } };
const brief = rejected => ({ rejected: rejected.slice(0, 20), rejectedCount: rejected.length });
const anyStatus = (tx, T) => tx.select({ n: sql`count(*)::int` }).from(T).where(sql`coalesce(${T.selectStatus},'') <> ''`).then(r => r[0].n);

export const importService = {
  // 9th_master_sheet / 10th_master_sheet -> Students_master_9th / _10th (marks, NMMS, TRUST, other marks, select_status and admit_status all come from this one sheet)
  async students({ body }) {
    const cls = parseClass(body?.classLevel), T = studentTable(cls), rows = sheet(body), good = [], rejected = [], seen = new Set();
    rows.forEach((r, i) => { const m = mapStudentRow(r, cls); if (m.error) rejected.push({ row: i + 2, reason: m.error }); else if (seen.has(m.value.emis)) rejected.push({ row: i + 2, reason: `duplicate EMIS ${m.value.emis} in the file` }); else { seen.add(m.value.emis); good.push(m.value); } });
    if (!good.length) throw new HttpError('No valid rows found', 400, brief(rejected));
    let inserted = 0;
    await db.transaction(async tx => {
      await lockClass(tx, cls, { exclusive: true });
      if (body.replace) { if (await anyStatus(tx, T)) throw new HttpError('Lists have already been generated for this class; the students can no longer be replaced.', 409); await tx.delete(T); }
      const have = new Set((await tx.select({ e: T.emis }).from(T)).map(r => r.e));
      const fresh = good.filter(s => !have.has(s.emis));
      for (const c of chunks(fresh)) inserted += (await tx.insert(T).values(c.map(v => pick(cls, v))).returning({ id: T.id })).length;
    });
    return { imported: inserted, skippedExisting: good.length - inserted, ...brief(rejected) };
  },

  // 9th_vacancy_sheet / 10th_vacancy_sheet -> Vacancies_9th / _10th, one row per seat
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
      if (user.role === 'SUPER_ADMIN') for (const d of new Set(good.map(g => g.newDistrict))) {                       // a DMS login for every district that furnished vacancies
        const username = `dms_${slug(d)}`, password = randPw();
        const added = await tx.insert(users).values({ username, passwordHash: bcrypt.hashSync(password, 10), role: 'DISTRICT', district: d }).returning({ u: users.username }).onConflictDoNothing();
        if (added.length) { newUsers.push({ username, password, role: 'DISTRICT', scope: d }); await setAccess(tx, username, [cls]); }
      }
    });
    return { imported: good.length, seats: good.reduce((n, c) => n + c.admitted + c.vacancies, 0), mode, newUsers, ...brief(rejected) };
  },
};
