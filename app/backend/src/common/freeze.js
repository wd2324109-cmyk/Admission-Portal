import { eq } from 'drizzle-orm';
import { access } from '../schema/index.js';
import { db } from '../db/index.js';

export const FROZEN = 'FROZEN', ALL_CLASSES = '*';
export const FROZEN_MSG = 'Your access has been frozen by the administrator. Please contact them to restore it.';

const TTL_MS = 5000;
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
