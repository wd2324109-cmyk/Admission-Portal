import { and, eq } from 'drizzle-orm';
import { users, students as S, vacancies as V } from '../schema/index.js';
import { db } from '../db/index.js';

                                                                                            
export const scope = u => u.role === 'DISTRICT' ? eq(S.district, u.district) : u.role === 'REGION' ? eq(S.regionalCentre, u.region) : undefined;
export const classFilter = c => (c ? eq(S.classLevel, +c) : undefined);
export const page1 = p => Math.max(1, parseInt(p, 10) || 1);
export const likeEsc = t => t.replace(/[\\%_]/g, m => '\\' + m);

                                                                                               
export async function userRegion(u) {
  if (u.role === 'REGION') return u.region;
  if (u.role === 'DISTRICT') {
    const [r] = await db.select({ rc: S.regionalCentre }).from(S).where(eq(S.district, u.district)).limit(1);
    return r?.rc ?? '__none__';
  }
  return null;
}


export const cellW = st => and(eq(V.regionalCentre, st.regionalCentre), eq(V.classLevel, st.classLevel), eq(V.gender, st.gender), eq(V.medium, st.medium), eq(V.community, st.selectedCategory));
export const CLEAN = { selectStatus: '', selectedCategory: '', admitStatus: '', replacesRegno: null, willingStatus: 'WILLING', unwillingLetter: null, verificationStatus: 'PENDING', verificationRemarks: null };
