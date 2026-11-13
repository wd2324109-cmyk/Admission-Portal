import { sql } from 'drizzle-orm';
const NS = 7301;
// One advisory lock per class: list generation, ranking and imports take it exclusively, single-student steps share it.
export const lockClass = (tx, cls, { exclusive = false } = {}) =>
  tx.execute(exclusive ? sql`select pg_advisory_xact_lock(${NS}::int, ${+cls}::int)` : sql`select pg_advisory_xact_lock_shared(${NS}::int, ${+cls}::int)`);
