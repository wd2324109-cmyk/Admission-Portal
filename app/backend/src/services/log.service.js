import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { studentLog, vacancyLogs } from '../schema/index.js';
import { db } from '../db/index.js';
import { likeEsc } from '../common/query.js';

export const logService = {
  async students({ query }) {
    const t = String(query.q || '').trim(), L = studentLog;
    const where = and(query.class ? eq(L.class, String(+query.class)) : undefined, t ? or(ilike(L.name, `%${likeEsc(t)}%`), ilike(L.updatedBy, `%${likeEsc(t)}%`), sql`${L.emis}::text like ${likeEsc(t) + '%'}`) : undefined);
    return db.select().from(L).where(where).orderBy(desc(L.id)).limit(Math.min(+query.limit || 300, 1000));
  },
  async vacancies({ query }) {
    const t = String(query.q || '').trim(), L = vacancyLogs;
    const where = and(query.class ? eq(L.classLevel, +query.class) : undefined, t ? or(ilike(L.newDistrict, `%${likeEsc(t)}%`), ilike(L.updatedBy, `%${likeEsc(t)}%`), sql`${L.vacancyRefNo}::text like ${likeEsc(t) + '%'}`) : undefined);
    return db.select().from(L).where(where).orderBy(desc(L.id)).limit(Math.min(+query.limit || 300, 1000));
  },
};
