import { sql } from 'drizzle-orm';
import { studentLog } from '../schema/index.js';

export async function nextListNumber(tx, cls) {
  const [{ n }] = (await tx.execute(sql`select coalesce(max(substring(remark1 from '^List ([0-9]+)')::int), 0) as n from ${studentLog} where "class" = ${String(cls)} and tag1 = 'LIST'`)).rows;
  return (+n || 0) + 1;
}
