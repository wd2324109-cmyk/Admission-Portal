import { inArray, sql } from 'drizzle-orm';
import { access } from '../schema/index.js';
import { db } from '../db/index.js';

// Freezing needs no delete and no update: the database login can only add rows to the access table.
// Freeze adds a FROZEN row and unfreeze adds an UNFROZEN row; each is stamped with the database clock
// (milliseconds, in Class_level), and whichever is newest decides. An old FROZEN row stamped "*" counts as time 0.
export const FROZEN = 'FROZEN', UNFROZEN = 'UNFROZEN';
export const FROZEN_MSG = 'Your access has been frozen by the administrator. Please contact them to restore it.';
const SKEW_MS = 5000;

const stampOf = level => { const n = Number(level); return Number.isFinite(n) && n >= 0 ? n : 0; };

// rows: access rows ({ user, classLevel, tag }). Returns a Map of username -> { frozen, since }, where "since" is when the latest freeze happened.
export function freezeStates(rows) {
  const seen = new Map();
  for (const r of rows) {
    if (r.tag !== FROZEN && r.tag !== UNFROZEN) continue;
    const s = seen.get(r.user) || { f: -1, u: -1 };
    if (r.tag === FROZEN) s.f = Math.max(s.f, stampOf(r.classLevel)); else s.u = Math.max(s.u, stampOf(r.classLevel));
    seen.set(r.user, s);
  }
  return new Map([...seen].map(([user, s]) => [user, { frozen: s.f >= 0 && s.f > s.u, since: Math.max(s.f, 0) }]));
}

const TTL_MS = 5000;
let cache = null, loadedAt = 0, loading = null;
const read = async () => freezeStates(await db.select({ user: access.user, classLevel: access.classLevel, tag: access.tag }).from(access).where(inArray(access.tag, [FROZEN, UNFROZEN])));
const states = async ({ fresh = false } = {}) => {
  if (fresh) return read();
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  loading ||= read().then(m => { cache = m; loadedAt = Date.now(); return m; }).finally(() => { loading = null; });
  return loading;
};

export const loginState = async (username, opts) => (await states(opts)).get(username) || { frozen: false, since: 0 };
export const isFrozen = async (username, opts) => (await loginState(username, opts)).frozen;
export const frozenSet = async opts => new Set([...(await states(opts))].filter(([, s]) => s.frozen).map(([u]) => u));
// A token issued before the latest freeze is dead, even after the login is unfrozen.
export const issuedBeforeFreeze = (loggedInAt, state) => !!state.since && Number(loggedInAt || 0) + SKEW_MS < state.since;
export const forgetFrozen = () => { cache = null; };

const NOW_MS = sql`(extract(epoch from clock_timestamp()) * 1000)::bigint::text`;
const add = async (username, tag) => { await db.insert(access).values({ user: username, classLevel: NOW_MS, tag }).onConflictDoNothing(); forgetFrozen(); };
export async function freezeLogin(username) { if (!(await isFrozen(username, { fresh: true }))) await add(username, FROZEN); }
export async function unfreezeLogin(username) { if (await isFrozen(username, { fresh: true })) await add(username, UNFROZEN); }
