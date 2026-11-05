import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { students as S } from '../schema/index.js';















const NS = 7301;

export const lockClass = (tx, classLevel, { exclusive = false } = {}) =>
  tx.execute(exclusive
    ? sql`select pg_advisory_xact_lock(${NS}::int, ${+classLevel}::int)`
    : sql`select pg_advisory_xact_lock_shared(${NS}::int, ${+classLevel}::int)`);


export const lockStudent = async (tx, id) => (await tx.select().from(S).where(eq(S.id, id)).for('update'))[0];


export const lockStudents = (tx, ids) => ids.length ? tx.select().from(S).where(inArray(S.id, ids)).orderBy(S.id).for('update') : Promise.resolve([]);




export const lockCell = (tx, a) => tx.select().from(S).where(and(
  eq(S.regionalCentre, a.regionalCentre), eq(S.classLevel, a.classLevel), eq(S.gender, a.gender), eq(S.medium, a.medium), eq(S.selectedCategory, a.selectedCategory),
  or(eq(S.id, a.id), and(sql`${S.selectStatus} <> ''`, eq(S.admitStatus, ''))))).orderBy(S.id).for('update');
