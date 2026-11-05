import { and, eq, sql, asc } from 'drizzle-orm';
import { seats as Z } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { HttpError } from '../../common/http.js';
import { userRegion, page1, likeEsc } from '../../common/query.js';
import { COMMUNITY_ORDER } from '../domain/selection.js';
import { SeatService } from '../seat.service.js';

const STATUSES = ['RESERVED', 'ADMITTED', 'VACANT'], SIZE = 50;

// One row per seat: who it is reserved for (or taken by), or that it is vacant. Read-only: the `seats` view is built from students + vacancies.
export class SeatServiceImpl extends SeatService {
  async list({ user, query }) {
    const rc = await userRegion(user);                                    // regional / district users see their own regional centre's seats
    const cls = +query.class, status = String(query.status || '').toUpperCase(), term = String(query.search || '').trim(), page = page1(query.page);
    if (query.class && ![9, 10].includes(cls)) throw new HttpError('class must be 9 or 10');
    if (status && !STATUSES.includes(status)) throw new HttpError('Invalid status');
    const base = and(rc ? eq(Z.regionalCentre, rc) : undefined, query.class ? eq(Z.classLevel, cls) : undefined);
    // A district user may not learn who the seat holders from OTHER districts are: their search only matches their own students.
    const find = term ? sql`(${Z.studentName} ilike ${'%' + likeEsc(term) + '%'} or ${Z.regno}::text = ${term})` : undefined;
    const mine = user.role === 'DISTRICT' ? sql`${Z.studentDistrict} = ${user.district}` : undefined;
    const where = and(base, status ? eq(Z.status, status) : undefined, find, term ? mine : undefined);
    try {
      const [rows, counts, [{ n }]] = await Promise.all([
        db.select().from(Z).where(where).orderBy(asc(Z.regionalCentre), asc(Z.classLevel), asc(Z.gender), asc(Z.medium),
          sql`array_position(${sql.raw(`ARRAY[${COMMUNITY_ORDER.map(c => `'${c}'`).join(',')}]::text[]`)}, ${Z.community})`, asc(Z.seatNo)).limit(SIZE).offset((page - 1) * SIZE),
        db.select({ status: Z.status, n: sql`count(*)::int` }).from(Z).where(base).groupBy(Z.status),
        db.select({ n: sql`count(*)::int` }).from(Z).where(where)]);
      const hide = r => user.role === 'DISTRICT' && r.studentId && r.studentDistrict !== user.district;
      return {
        rows: rows.map(r => hide(r) ? { ...r, studentId: null, regno: null, studentName: null, studentDistrict: null, hidden: true } : r),
        total: n, pages: Math.max(1, Math.ceil(n / SIZE)),
        counts: Object.fromEntries(STATUSES.map(s => [s, counts.find(c => c.status === s)?.n ?? 0])),
      };
    } catch (e) {
      if (e.code === '42P01' || e.cause?.code === '42P01') throw new HttpError('The seat list is not set up yet. Run "npm run db:upgrade" in the backend folder.', 503);
      throw e;
    }
  }
}
