import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { classesOf, scope, seatScope } from '../common/access.js';
import { studentTable, norm } from '../common/studentStore.js';
import { seatTable } from '../common/seats.js';
import { GROUP_SQL } from '../workflow/statuses.js';
import { buildCells } from '../workflow/allocation.js';

const counts = Object.entries(GROUP_SQL).map(([k, c]) => `count(*) filter (where ${c})::int as ${k}`).join(', ');

export const dashboardService = {
  async summary({ user }) {
    const classes = await classesOf(user), byClass = [], dist = new Map(), comm = new Map(), vacancy = { seats: 0, joined: 0, held: 0, open: 0 };
    const add = (m, key, r) => { const x = m.get(key) ?? m.set(key, { key, total: 0 }).get(key); x.total += r.total; for (const g of Object.keys(GROUP_SQL)) x[g] = (x[g] || 0) + r[g]; };
    for (const cls of classes) {
      const T = studentTable(cls), V = seatTable(cls), w = scope(user, cls), grp = col => db.execute(sql`select ${col} as key, count(*)::int as total, ${sql.raw(counts)} from ${T} ${w ? sql`where ${w}` : sql``} group by 1`);
      // Seats are counted exactly as Vacancy Management counts them: a vacant seat that a listed / selected
      // student is holding is "held", not "open". open = vacant seats - held seats, per seat group.
      const [all, d, c, seats, holders] = await Promise.all([grp(sql`${cls}::int`), grp(T.district), grp(T.community),
        db.select().from(V).where(seatScope(user, V)),
        db.select().from(T).where(sql`${T.selectStatus} in ('1A','2A','7A')`)]);
      if (all.rows[0]) byClass.push({ ...all.rows[0], key: cls });
      d.rows.forEach(r => add(dist, r.key ?? '-', r)); c.rows.forEach(r => add(comm, r.key ?? '-', r));
      for (const cell of buildCells(holders.map(r => norm(r, cls)), seats, cls)) {
        vacancy.seats += cell.seats; vacancy.joined += cell.joined; vacancy.held += cell.held; vacancy.open += cell.open;
      }
    }
    return { byClass, byDistrict: [...dist.values()], byCommunity: [...comm.values()], vacancy };
  },
};
