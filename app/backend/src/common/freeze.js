// Frozen DMS logins. No new table or column: a frozen user has ONE row in the `access` table
//   User = <username>, Class_level = '*', tag = 'FROZEN'
// (class access rows use tag 'ACTIVE' and a real class number, so the two never mix; classesOf() only reads ACTIVE rows.)
import { eq } from 'drizzle-orm';
import { access } from '../schema/index.js';
import { db } from '../db/index.js';

export const FROZEN = 'FROZEN', ALL_CLASSES = '*';
export const FROZEN_MSG = 'Your access has been frozen by the administrator. Please contact them to restore it.';

const TTL_MS = 5000;                       // other requests re-read at most every 5 s; the sign-in always reads fresh
let cache = null, loadedAt = 0, loading = null;

const read = async x => new Set((await x.select({ u: access.user }).from(access).where(eq(access.tag, FROZEN))).map(r => r.u));

export async function frozenSet({ fresh = false } = {}) {
  if (fresh) return read(db);
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  loading ||= read(db).then(s => { cache = s; loadedAt = Date.now(); return s; }).finally(() => { loading = null; });
  return loading;
}
export const isFrozen = async (username, opts) => (await frozenSet(opts)).has(username);
export const forgetFrozen = () => { cache = null; };
