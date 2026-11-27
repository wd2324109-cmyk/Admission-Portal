import { and, asc, desc, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studentLog } from '../schema/index.js';
import { requireClass, scope } from '../common/access.js';
import { studentTable, parseClass } from '../common/studentStore.js';
import { likeEsc } from '../common/query.js';
import { view } from './student.service.js';

const SIZE = 25;

// REGION = waiting for the RC (8A), STATE = waiting for the SC (8B), ADMIN = waiting for the super admin (8C), DONE = TC issued (8D), REJECTED = back with the HM to resubmit (8Z).
export const TC_STAGE_SQL = {
  JOINED: `select_status in ('3A','3B')`,
  REGION: `select_status = '8A'`,
  STATE: `select_status = '8B'`,
  ADMIN: `select_status = '8C'`,
  DONE: `select_status = '8D'`,
  REJECTED: `select_status = '8Z'`,
};
const STAGE_OF_CODE = { '8A': 'REGION', '8B': 'STATE', '8C': 'ADMIN', '8D': 'DONE', '8Z': 'REJECTED' };
export const tcStageOf = r => STAGE_OF_CODE[r.selectStatus] || 'JOINED';
// tag2 of a rejected request says who rejected it: TC-REJ-RC, TC-REJ-SC or TC-REJ-ADMIN.
export const rejectedByOf = r => (r.selectStatus === '8Z' ? String(r.tag2 || '').replace('TC-REJ-', '') || null : null);

// The reason column shows what the HM wrote when requesting (or resubmitting), not the latest approver's remark that sits on the student row.
async function requestReasons(cls, rows) {
  const emis = [...new Set(rows.map(r => r.emis).filter(Number.isInteger))];
  if (!emis.length) return new Map();
  const logs = await db.select({ cls: studentLog.class, emis: studentLog.emis, remark: studentLog.remark1 }).from(studentLog)
    .where(and(inArray(studentLog.emis, emis), inArray(studentLog.tag1, ['TC_REQUEST', 'TC_RESUBMIT']))).orderBy(desc(studentLog.id));
  const m = new Map();
  for (const l of logs) { const k = `${l.cls}|${l.emis}`; if (!m.has(k)) m.set(k, l.remark); }
  return m;
}

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
    const reasons = await requestReasons(cls, rows);
    return { rows: rows.map(r => ({ ...view(r, cls, user.role), tcStage: tcStageOf(r), rejectedBy: rejectedByOf(r), reason: tcStageOf(r) === 'JOINED' ? null : reasons.get(`${r.class ?? String(cls)}|${r.emis}`) ?? null })), total: n, pages: Math.max(1, Math.ceil(n / SIZE)) };
  },
};
