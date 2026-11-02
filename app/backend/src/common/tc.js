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
export const TC_SNAP = t => ({ status: t.status, reviewedBy: t.reviewedBy ?? null, reviewedAt: t.reviewedAt ?? null, reviewRemarks: t.reviewRemarks ?? null,
  stage: t.stage, rejectedLevel: t.rejectedLevel ?? null,
  rcBy: t.rcBy ?? null, rcAt: t.rcAt ?? null, rcRemarks: t.rcRemarks ?? null, scBy: t.scBy ?? null, scAt: t.scAt ?? null, scRemarks: t.scRemarks ?? null });

/** Turns a stored snapshot (JSON, so dates are text) back into values the table accepts. */
// Snapshots saved before the approval chain existed have no `stage`: a pending one starts the chain again, anything else is finished.
export const tcRestore = b => ({ status: b.status, reviewedBy: b.reviewedBy ?? null, reviewedAt: b.reviewedAt ? new Date(b.reviewedAt) : null, reviewRemarks: b.reviewRemarks ?? null,
  stage: b.stage ?? (b.status === 'PENDING' ? 'REGION' : 'DONE'), rejectedLevel: b.rejectedLevel ?? null,
  rcBy: b.rcBy ?? null, rcAt: b.rcAt ? new Date(b.rcAt) : null, rcRemarks: b.rcRemarks ?? null,
  scBy: b.scBy ?? null, scAt: b.scAt ? new Date(b.scAt) : null, scRemarks: b.scRemarks ?? null });

/** The chain: who decides at each stage, what it is called on screen, and the role that owns the stage. */
export const TC_STAGES = { REGION: { role: 'REGION', label: 'RC' }, STATE: { role: 'STATE', label: 'SC' }, ADMIN: { role: 'SUPER_ADMIN', label: 'Super Admin' } };
export const stageOfRole = role => Object.entries(TC_STAGES).find(([, v]) => v.role === role)?.[0];

/** Who not approving ended this request (older rows from before the chain were all Super Admin decisions). */
export const rejectedBy = t => t.status === 'REJECTED' ? (t.rejectedLevel || 'ADMIN') : null;

/** The state coordinator only sees a request once the regional coordinator has approved it (or it was decided at/after their step). */
export const visibleTo = (user, t) => user.role !== 'STATE' || (t.status === 'PENDING' ? ['STATE', 'ADMIN'].includes(t.stage) : t.status === 'REJECTED' ? ['STATE', 'ADMIN'].includes(rejectedBy(t)) : true);
