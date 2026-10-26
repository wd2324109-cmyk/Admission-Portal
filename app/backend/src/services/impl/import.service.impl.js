import bcrypt from 'bcryptjs';
import { and, eq, or, sql, inArray } from 'drizzle-orm';
import { users, students as S, vacancies as V, statusLogs } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { readSheet, chunks, slug, randPw } from '../../common/excel.js';
import { HttpError } from '../../common/http.js';
import { scope } from '../../common/query.js';
import { mapStudentRow, mapVacancyRow } from '../domain/importMap.js';

import { ImportService } from '../import.service.js';

export class ImportServiceImpl extends ImportService {
  async students({ user, params, query, body }) {
    const { fileData, classLevel, replace } = body || {};
    if (![9, 10].includes(+classLevel)) throw new HttpError('Choose class 9 or 10');
    let rows; try { rows = readSheet(fileData); } catch { throw new HttpError('Could not read the file. Upload a valid .xlsx file'); }
    if (!rows.length) throw new HttpError('The sheet has no rows');
    const good = [], rejected = [], seen = new Set();
    rows.forEach((r, i) => {
      const m = mapStudentRow(r, +classLevel);
      if (m.error) rejected.push({ row: i + 2, reason: m.error });
      else if (seen.has(m.value.regno)) rejected.push({ row: i + 2, reason: `duplicate REGNO ${m.value.regno} in file` });
      else { seen.add(m.value.regno); good.push(m.value); }
    });
    if (!good.length) throw new HttpError('No valid rows found', 400, { rejected: rejected.slice(0, 20), rejectedCount: rejected.length });
    let inserted = 0; const newUsers = [];
    await db.transaction(async tx => {
      if (replace) {
        const ids = tx.select({ id: S.id }).from(S).where(eq(S.classLevel, +classLevel));
        await tx.delete(statusLogs).where(inArray(statusLogs.studentId, ids));
        await tx.delete(S).where(eq(S.classLevel, +classLevel));
      }
      for (const c of chunks(good)) inserted += (await tx.insert(S).values(c).onConflictDoNothing({ target: S.regno }).returning({ r: S.regno })).length;
                                                                                                            
      const wanted = [...new Set(good.map(s => `district|${s.district}`)), ...new Set(good.map(s => `region|${s.regionalCentre}`))];
      for (const w of wanted) {
        const [kind, name] = w.split('|'), username = `${kind}_${slug(name)}`, password = randPw();
        const added = await tx.insert(users).values({ username, passwordHash: bcrypt.hashSync(password, 10), role: kind === 'district' ? 'DISTRICT' : 'REGION',
          district: kind === 'district' ? name : null, region: kind === 'region' ? name : null }).onConflictDoNothing({ target: users.username }).returning({ u: users.username });
        if (added.length) newUsers.push({ username, password, role: kind.toUpperCase(), scope: name });
      }
    });
    await audit(db, { user }, { action: 'IMPORT_STUDENTS', message: `Class ${classLevel}: ${inserted} imported, ${good.length - inserted} skipped, ${rejected.length} rejected${replace ? ' (existing students replaced)' : ''}, ${newUsers.length} logins created` });
    return ({ imported: inserted, skippedExisting: good.length - inserted, rejectedCount: rejected.length, rejected: rejected.slice(0, 20), newUsers });
  }

  async vacancies({ user, params, query, body }) {
    const { fileData, classLevel } = body || {};
    if (![9, 10].includes(+classLevel)) throw new HttpError('Choose class 9 or 10');
    let rows; try { rows = readSheet(fileData); } catch { throw new HttpError('Could not read the file. Upload a valid .xlsx file'); }
    const good = [], rejected = [], seen = new Set();
    rows.forEach((r, i) => {
      const m = mapVacancyRow(r, +classLevel), k = m.value && [m.value.regionalCentre, m.value.classLevel, m.value.gender, m.value.medium, m.value.community].join('|');
      if (m.error) rejected.push({ row: i + 2, reason: m.error });
      else if (seen.has(k)) rejected.push({ row: i + 2, reason: 'duplicate vacancy row for the same centre/gender/medium/community' });
      else { seen.add(k); good.push(m.value); }
    });
    if (!good.length) throw new HttpError('No valid rows found', 400, { rejected: rejected.slice(0, 20), rejectedCount: rejected.length });
    const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(S).where(and(eq(S.classLevel, +classLevel), sql`${S.admitStatus} <> ''`));
    if (n) throw new HttpError('Admissions have already started for this class; vacancies can no longer be replaced');
    await db.transaction(async tx => { await tx.delete(V).where(eq(V.classLevel, +classLevel)); for (const c of chunks(good)) await tx.insert(V).values(c); });
    await audit(db, { user }, { action: 'IMPORT_VACANCIES', message: `Class ${classLevel}: ${good.length} vacancy rows imported, ${rejected.length} rejected` });
    return ({ imported: good.length, rejectedCount: rejected.length, rejected: rejected.slice(0, 20), newUsers: [] });
  }
}
