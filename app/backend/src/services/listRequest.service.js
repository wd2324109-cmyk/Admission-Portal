import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { studentLog as L, users } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { classesOf, requireClass, scope, districtsOf } from '../common/access.js';
import { studentTable, parseClass } from '../common/studentStore.js';
import { frozenSet } from '../common/freeze.js';
import { TAG, OPEN, DONE, PENDING_CODES, progress, readMeta } from '../workflow/listRequest.js';

const LOCK_NS = 7302;
const upper = col => sql`upper(trim(${col}))`;

async function counts(x, user, cls) {
  const T = studentTable(cls);
  const [r] = await x.select({
    total: sql`count(*) filter (where coalesce(${T.selectStatus}, '') <> '')::int`,
    waiting: sql`count(*) filter (where ${T.selectStatus} in (${sql.join(PENDING_CODES.map(c => sql`${c}`), sql`, `)}))::int`,
  }).from(T).where(scope(user, cls));
  return r;
}

const shape = (r, extra = {}) => { const m = readMeta(r.remark2);
  return { id: r.id, classLevel: +r.class, district: r.district, requestedBy: r.updatedBy, requestedAt: r.updatedAt, note: r.remark1 || null, status: r.tag2,
    decided: m.decided ?? null, total: m.total ?? null, percent: m.percent ?? null, doneBy: m.doneBy ?? null, doneAt: m.doneAt ?? null, doneNote: m.doneNote ?? null, ...extra }; };

export const listRequestService = {

  async list({ user, query }) {
    const admin = user.role === 'SUPER_ADMIN', d = districtsOf(user);
    const where = and(eq(L.tag1, TAG), admin ? undefined : d.length ? inArray(upper(L.district), d) : sql`false`,
      [OPEN, DONE].includes(query.status) ? eq(L.tag2, query.status) : undefined, query.class ? eq(L.class, String(+query.class)) : undefined);
    const rows = await db.select().from(L).where(where).orderBy(desc(L.id)).limit(300);
    if (!admin) {
      const out = [];
      for (const cls of await classesOf(user)) out.push({ classLevel: cls, ...progress(await counts(db, user, cls)) });
      return { rows: rows.map(r => shape(r)), progress: out };
    }
    const names = [...new Set(rows.map(r => r.updatedBy).filter(Boolean))];
    const [accounts, frozen] = await Promise.all([names.length ? db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.username, names)) : [], frozenSet({ fresh: true })]);
    const byName = new Map(accounts.map(a => [a.username, a.id]));
    return { rows: rows.map(r => shape(r, { userId: byName.get(r.updatedBy) ?? null, frozen: frozen.has(r.updatedBy) })), progress: [] };
  },

  async raise({ user, body }) {
    const cls = await requireClass(user, parseClass(body?.classLevel)), note = String(body?.note || '').trim(), district = districtsOf(user).join(', ');
    if (note.length > 300) throw new HttpError('The note is too long (300 characters at most)');
    if (!district) throw new HttpError('Your login has no district, so a request cannot be raised', 409);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NS}::int, hashtext(${district + '|' + cls}::text))`);
      const p = progress(await counts(tx, user, cls));
      if (!p.canRequest) throw new HttpError(p.reason, 409, { progress: p });
      const [open] = await tx.select({ id: L.id }).from(L).where(and(eq(L.tag1, TAG), eq(L.tag2, OPEN), eq(L.class, String(cls)), eq(upper(L.district), district.toUpperCase()))).limit(1);
      if (open) throw new HttpError('A request for this class is already waiting for the super admin.', 409);
      await tx.insert(L).values({ district, class: String(cls), tag1: TAG, tag2: OPEN, remark1: note || null,
        remark2: JSON.stringify({ decided: p.decided, total: p.total, percent: p.percent }), updatedBy: user.username, updatedAt: new Date() });
      return { ok: true, progress: p };
    });
  },

  async done({ user, params, body }) {
    const id = +params.id || 0, note = String(body?.note || '').trim();
    if (note.length > 300) throw new HttpError('The note is too long (300 characters at most)');
    await db.transaction(async tx => {
      const [r] = await tx.select().from(L).where(and(eq(L.id, id), eq(L.tag1, TAG))).for('update');
      if (!r) throw new HttpError('Request not found', 404);
      if (r.tag2 !== OPEN) throw new HttpError('This request is already marked done', 409);
      await tx.update(L).set({ tag2: DONE, remark2: JSON.stringify({ ...readMeta(r.remark2), doneBy: user.username, doneAt: new Date().toISOString(), doneNote: note || null }) }).where(eq(L.id, id));
    });
    return { ok: true };
  },
};
