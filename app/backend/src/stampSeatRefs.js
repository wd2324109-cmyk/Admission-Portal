import 'dotenv/config';
import { db, pool } from './db/index.js';
import { lockClass } from './common/locks.js';
import { seatTable } from './common/seats.js';
import { studentTable, CLASSES } from './common/studentStore.js';
import { reconcileSeatRefs } from './common/seatRef.js';

// Gives every existing vacancy row its reference (Group_code) and every allotted 9th class student the reference of his or her seat (remark2).
// Idempotent: rows that are already right are not written. Runs once at server start and can also be run by hand: npm run stamp:refs
export async function stampAllSeatRefs() {
  const out = {};
  for (const cls of CLASSES) out[cls] = await db.transaction(async tx => { await lockClass(tx, cls, { exclusive: true }); return reconcileSeatRefs(tx, seatTable(cls), studentTable(cls), cls); });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  stampAllSeatRefs().then(r => { console.log('Seat references checked. Student rows changed per class:', r); return pool.end(); }).catch(e => { console.error(e); process.exit(1); });
}
