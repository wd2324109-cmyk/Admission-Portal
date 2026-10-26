import * as XLSX from 'xlsx';
import { and, eq, asc } from 'drizzle-orm';
import { students as S, vacancies as V } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { HttpError } from '../../common/http.js';
import { scope, userRegion } from '../../common/query.js';
import { audit } from '../../common/audit.js';
import { ExportService } from '../export.service.js';

const toBuffer = (rows, sheet) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
const day = () => new Date().toISOString().slice(0, 10);
const classOf = q => { const c = q.class ? +q.class : null; if (c !== null && ![9, 10].includes(c)) throw new HttpError('class must be 9 or 10'); return c; };

                                                                                                          
export class ExportServiceImpl extends ExportService {
  async master({ user, query }) {
    const c = classOf(query);
    const rows = await db.select().from(S).where(and(scope(user), c ? eq(S.classLevel, c) : undefined)).orderBy(asc(S.classLevel), asc(S.regionalCentre), asc(S.regno));
    const data = rows.map(s => ({ Regional_centre: s.regionalCentre, District: s.district, school_name: s.schoolName, Class: s.classLevel, Emis_No: s.emisNo, name: s.name, dob: s.dob, Gender: s.gender,
      Disability_status: s.disability ? 'Yes' : 'No', Community: s.community, Medium: s.medium, TOTAL: s.total, REGNO: s.regno, ORANK: s.orank, PHONE_NUMBER: s.phone,
      Select_Status: s.selectStatus, Selected_category: s.selectedCategory, Admit_status: s.admitStatus, Willing_status: s.willingStatus, Verification_status: s.verificationStatus }));
    await audit(db, { user }, { action: 'EXPORT_MASTER', message: `Master sheet downloaded (${c ? 'Class ' + c : 'all classes'}, ${data.length} rows)` });
    return { buffer: toBuffer(data, 'Master'), filename: `Master_${c ? 'Class' + c + '_' : ''}${day()}.xlsx` };
  }

  async vacancies({ user, query }) {
    const c = classOf(query), rc = await userRegion(user);
    const rows = await db.select().from(V).where(and(c ? eq(V.classLevel, c) : undefined, rc ? eq(V.regionalCentre, rc) : undefined))
      .orderBy(asc(V.regionalCentre), asc(V.classLevel), asc(V.gender), asc(V.medium), asc(V.community));
    const data = rows.map(v => ({ Regional_centre: v.regionalCentre, Class: v.classLevel, Gender: v.gender, Medium: v.medium, Community: v.community, Admitted: v.admitted, Vacancies: v.vacancies, Filled: v.filled, Balance: v.balance, Status: v.status }));
    await audit(db, { user }, { action: 'EXPORT_VACANCIES', message: `Vacancy sheet downloaded (${c ? 'Class ' + c : 'all classes'}, ${data.length} rows)` });
    return { buffer: toBuffer(data, 'Vacancies'), filename: `Vacancies_${c ? 'Class' + c + '_' : ''}${day()}.xlsx` };
  }
}
