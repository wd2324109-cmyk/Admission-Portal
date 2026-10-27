import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { students as S, vacancies as V } from '../schema/index.js';
import { cellW } from './query.js';

/*
 * Concurrency rules for every operation that reads state, decides, then writes.
 *
 * Without locks two users can both read "not admitted yet", both pass the check and both write,
 * double-counting a seat. Inside ONE transaction each operation therefore:
 *
 *   1. takes the class lock      - SHARED for normal edits (they run side by side),
 *                                  EXCLUSIVE for selection runs / imports (they run alone),
 *   2. locks the student rows    - FOR UPDATE, always in ascending id order,
 *   3. locks the vacancy row     - FOR UPDATE,
 *   4. re-reads and re-validates under the lock, then writes.
 *
 * Always taking locks in this same order is what prevents deadlocks.
 */
const NS = 7301;

export const lockClass = (tx, classLevel, { exclusive = false } = {}) =>
  tx.execute(exclusive
    ? sql`select pg_advisory_xact_lock(${NS}::int, ${+classLevel}::int)`
    : sql`select pg_advisory_xact_lock_shared(${NS}::int, ${+classLevel}::int)`);

/** Lock and return one student row (fresh, authoritative copy). */
export const lockStudent = async (tx, id) => (await tx.select().from(S).where(eq(S.id, id)).for('update'))[0];

/** Lock several students in ascending id order. */
export const lockStudents = (tx, ids) => ids.length ? tx.select().from(S).where(inArray(S.id, ids)).orderBy(S.id).for('update') : Promise.resolve([]);

/** Lock and return the vacancy cell a student's seat belongs to. */
export const lockVacancy = async (tx, st) => (await tx.select().from(V).where(cellW(st)).for('update'))[0];

/** Lock a student together with every other selected-but-undecided student competing for the same seats. */
export const lockCell = (tx, a) => tx.select().from(S).where(and(
  eq(S.regionalCentre, a.regionalCentre), eq(S.classLevel, a.classLevel), eq(S.gender, a.gender), eq(S.medium, a.medium), eq(S.selectedCategory, a.selectedCategory),
  or(eq(S.id, a.id), and(sql`${S.selectStatus} <> ''`, eq(S.admitStatus, ''))))).orderBy(S.id).for('update');
