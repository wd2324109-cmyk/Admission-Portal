import { sql } from 'drizzle-orm';
import { studentLog } from '../schema/index.js';
// The next "List n" number of a class. Every list that reaches the portal (generated, or imported with its statuses) is written to Student_LOG
// with tag1 = 'LIST' and remark1 = 'List n', so the numbering continues whichever way the previous list came in.
export async function nextListNumber(tx, cls) {
  const [{ n }] = (await tx.execute(sql`select coalesce(max(substring(remark1 from '^List ([0-9]+)')::int), 0) as n from ${studentLog} where "class" = ${String(cls)} and tag1 = 'LIST'`)).rows;
  return (+n || 0) + 1;
}
