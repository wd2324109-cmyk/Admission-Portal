import { and, eq, sql } from 'drizzle-orm';
import { students as S } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { scope, userRegion } from '../../common/query.js';

import { DashboardService } from '../dashboard.service.js';

export class DashboardServiceImpl extends DashboardService {
  async summary({ user, params, query, body }) {
    const w = scope(user), rc = await userRegion(user);
    const grp = col => db.select({ key: col, total: sql`count(*)::int`,
        pending: sql`count(*) filter (where ${S.selectStatus} = '' and ${S.admitStatus} = '' and ${S.willingStatus} <> 'UNWILLING')::int`,
        selected: sql`count(*) filter (where ${S.selectStatus} <> '' and ${S.admitStatus} = '')::int`,
        joined: sql`count(*) filter (where ${S.admitStatus} = 'Admitted')::int`,
        notjoined: sql`count(*) filter (where (${S.selectStatus} = '' and ${S.admitStatus} = '' and ${S.willingStatus} = 'UNWILLING') or ${S.admitStatus} like 'Not Admitted%')::int`,
        tc: sql`count(*) filter (where ${S.admitStatus} like 'TC Issued%')::int` })
      .from(S).where(w).groupBy(col).orderBy(col);
    const [byClass, byDistrict, byCommunity, pv, vac] = await Promise.all([
      grp(S.classLevel), grp(S.district), grp(S.community),
      db.select({ n: sql`count(*)::int` }).from(S).where(and(w, eq(S.willingStatus, 'UNWILLING'), eq(S.verificationStatus, 'PENDING'))),
      db.execute(sql`select count(*) filter (where "Vacancy_status" <> 'JOINED')::int as seats, count(*) filter (where "Vacancy_status" = 'JOINED')::int as admitted,
          count(distinct ("New_district", class_level, gender, medium, community)) filter (where "Vacancy_status" = 'SHORTFALL')::int as shortfall
        from (select * from "Vacancies_9th" union all select * from "Vacancies_10th" union all select * from "Vacancies_11th") v
        ${rc ? sql`where "New_district" = ${rc}` : sql``}`),
    ]);
    return ({ byClass, byDistrict, byCommunity, pendingVerification: pv[0].n, vacancy: vac.rows[0] });
  }
}
