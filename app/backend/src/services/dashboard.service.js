import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { classesOf, scope, seatScope } from '../common/access.js';
import { studentTable } from '../common/studentStore.js';
import { seatTable } from '../common/seats.js';
import { GROUP_SQL } from '../workflow/statuses.js';

const counts = Object.entries(GROUP_SQL).map(([k, c]) => `count(*) filter (where ${c})::int as ${k}`).join(', ');

export const dashboardService = {
  async summary({ user }) {
    const classes = await classesOf(user), byClass = [], dist = new Map(), comm = new Map(), vacancy = { seats: 0, joined: 0, open: 0 };
    const add = (m, key, r) => { const x = m.get(key) ?? m.set(key, { key, total: 0 }).get(key); x.total += r.total; for (const g of Object.keys(GROUP_SQL)) x[g] = (x[g] || 0) + r[g]; };
    for (const cls of classes) {
      const T = studentTable(cls), V = seatTable(cls), w = scope(user, cls), grp = col => db.execute(sql`select ${col} as key, count(*)::int as total, ${sql.raw(counts)} from ${T} ${w ? sql`where ${w}` : sql``} group by 1`);
      const [all, d, c, v] = await Promise.all([grp(sql`${cls}::int`), grp(T.district), grp(T.community),
        db.execute(sql`select count(*)::int as seats, count(*) filter (where "Vacancy_status" = 'JOINED')::int as joined from ${V} ${seatScope(user, V) ? sql`where ${seatScope(user, V)}` : sql``}`)]);
      if (all.rows[0]) byClass.push({ ...all.rows[0], key: cls });
      d.rows.forEach(r => add(dist, r.key ?? '-', r)); c.rows.forEach(r => add(comm, r.key ?? '-', r));
      vacancy.seats += v.rows[0].seats; vacancy.joined += v.rows[0].joined;
    }
    vacancy.open = vacancy.seats - vacancy.joined;
    return { byClass, byDistrict: [...dist.values()], byCommunity: [...comm.values()], vacancy };
  },
};
