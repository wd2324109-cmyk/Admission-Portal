// Section 6, last part: the TC Requests screen.
// It lists every JOINED student (3A, 3B) of the caller's scope, so the DMS can open one and request a TC, together with the students whose TC
// is on its way (8A: waiting for the Regional Coordinator, then for the State Regional Coordinator) or issued (8B).
// The request and the approvals themselves are student actions (TC_REQUEST, TC_RC_APPROVE / TC_RC_REJECT, TC_STATE_APPROVE / TC_STATE_REJECT in workflow/transitions.js);
// this only lists them. A TC is requested ONLY from this screen (the Student Details screen offers no TC step).
import { and, asc, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requireClass, scope } from '../common/access.js';
import { studentTable, parseClass } from '../common/studentStore.js';
import { likeEsc } from '../common/query.js';
import { view } from './student.service.js';

const SIZE = 25;
// tcStage: JOINED = joined, no TC requested yet; REGION / STATE = waiting for that coordinator; DONE = TC issued.
export const TC_STAGE_SQL = {
  JOINED: `select_status in ('3A','3B')`,
  REGION: `(select_status = '8A' and coalesce(tag2,'') <> 'TC-SRC')`,
  STATE: `(select_status = '8A' and tag2 = 'TC-SRC')`,
  DONE: `select_status = '8B'`,
};
export const tcStageOf = r => (r.selectStatus === '8B' ? 'DONE' : r.selectStatus === '8A' ? (r.tag2 === 'TC-SRC' ? 'STATE' : 'REGION') : 'JOINED');

export const tcService = {
  async list({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), T = studentTable(cls), term = String(query.search || '').trim();
    const page = Math.max(1, parseInt(query.page, 10) || 1), stage = String(query.stage || '').toUpperCase();
    const any = sql.raw(`(${Object.values(TC_STAGE_SQL).join(' or ')})`);
    const st = Object.hasOwn(TC_STAGE_SQL, stage) ? sql.raw(TC_STAGE_SQL[stage]) : any;
    const q = term ? or(ilike(T.name, `%${likeEsc(term)}%`), sql`${T.emis}::text like ${likeEsc(term) + '%'}`) : undefined;
    const where = and(scope(user, cls), st, q);
    const [rows, [{ n }]] = await Promise.all([
      db.select().from(T).where(where).orderBy(sql`${T.orank} asc nulls last`, asc(T.id)).limit(SIZE).offset((page - 1) * SIZE),
      db.select({ n: sql`count(*)::int` }).from(T).where(where)]);
    return { rows: rows.map(r => ({ ...view(r, cls, user.role), tcStage: tcStageOf(r), reason: r.selectStatus === '8A' || r.selectStatus === '8B' ? r.remark1 : null })), total: n, pages: Math.max(1, Math.ceil(n / SIZE)) };
  },
};
