import { desc, eq } from 'drizzle-orm';
import { tcRequests as T } from '../schema/index.js';

/*
 * TC requests live in the tc_requests table. A student can have several over time (for example a
 * rejected request followed by a new one); the LATEST row (highest id) is the student's current TC state.
 */

/** The student's current TC request, or undefined. Pass lock=true inside a transaction to lock the row. */
export const latestTc = async (x, studentId, lock = false) => {
  const q = x.select().from(T).where(eq(T.studentId, studentId)).orderBy(desc(T.id)).limit(1);
  return (await (lock ? q.for('update') : q))[0];
};

/** What an undo has to put back on a TC request row. */
export const TC_SNAP = t => ({ status: t.status, reviewedBy: t.reviewedBy ?? null, reviewedAt: t.reviewedAt ?? null, reviewRemarks: t.reviewRemarks ?? null });

/** Turns a stored snapshot (JSON, so dates are text) back into values the table accepts. */
export const tcRestore = b => ({ status: b.status, reviewedBy: b.reviewedBy ?? null, reviewedAt: b.reviewedAt ? new Date(b.reviewedAt) : null, reviewRemarks: b.reviewRemarks ?? null });
