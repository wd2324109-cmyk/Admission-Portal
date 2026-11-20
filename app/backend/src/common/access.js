import { and, eq, inArray, sql } from 'drizzle-orm';
import { access } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from './http.js';
import { CLASSES, studentTable } from './studentStore.js';

export const ACTIVE = 'ACTIVE';
export const districtsOf = user => String(user.role === 'REGION' ? user.region ?? '' : user.district ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

export async function classesOf(user) {
  if (user.role === 'SUPER_ADMIN') return CLASSES;
  const rows = await db.select({ c: access.classLevel }).from(access).where(and(eq(access.user, user.username), eq(access.tag, ACTIVE)));
  return CLASSES.filter(c => rows.some(r => String(r.c).trim() === String(c)));
}
export async function requireClass(user, cls) {
  if (!(await classesOf(user)).includes(+cls)) throw new HttpError(`You do not have access to Class ${cls}`, 403);
  return +cls;
}

export function scope(user, cls) {
  if (user.role === 'DISTRICT' || user.role === 'REGION') {
    const T = studentTable(cls), d = districtsOf(user);
    return d.length ? inArray(sql`upper(trim(${T.newDistcName}))`, d) : sql`false`;
  }
  return undefined;
}

export const inScope = (user, st) => user.role === 'SUPER_ADMIN' || user.role === 'STATE' || (['DISTRICT', 'REGION'].includes(user.role) && districtsOf(user).includes(String(st.newDistcName ?? '').trim().toUpperCase()));
export const seatScope = (user, T) => (['DISTRICT', 'REGION'].includes(user.role) ? (districtsOf(user).length ? inArray(sql`upper(trim(${T.newDistrict}))`, districtsOf(user)) : sql`false`) : undefined);
