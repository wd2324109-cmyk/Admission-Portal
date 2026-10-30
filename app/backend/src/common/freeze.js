import { asc, inArray } from 'drizzle-orm';
import { auditLogs as A, users } from '../schema/index.js';
import { db } from '../db/index.js';

/*
 * Frozen access.
 *
 * The users table has no "frozen" column, so a user's frozen state is the LAST freeze/unfreeze entry written
 * for that user in audit_logs (action FREEZE or UNFREEZE). The audit log is therefore also the record of who
 * froze whom, when and why. Nothing else is stored.
 *
 * Reading the log on every request would be slow, so the result is cached for a few seconds and the cache is
 * dropped the moment this server freezes or unfreezes someone. Another server sees the change within TTL_MS.
 */
const TTL_MS = 5000;
export const frozenMessage = (username, reason) => `Access frozen for ${username}: ${reason}`;
export const restoredMessage = username => `Access restored for ${username}`;

let cache = null, loadedAt = 0, loading = null;

async function read(x) {
  const [us, events] = await Promise.all([
    x.select({ username: users.username }).from(users),
    x.select({ action: A.action, message: A.message, actor: A.actor, at: A.at }).from(A).where(inArray(A.action, ['FREEZE', 'UNFREEZE'])).orderBy(asc(A.id))]);
  const names = us.map(u => u.username).sort((a, b) => b.length - a.length);
  const frozen = new Map();                                  // username -> { by, reason, at }  (only people frozen right now)
  for (const e of events) {
    if (e.action === 'FREEZE') {
      const n = names.find(n => e.message.startsWith(frozenMessage(n, '')));
      if (n) frozen.set(n, { by: e.actor, reason: e.message.slice(frozenMessage(n, '').length), at: e.at });
    } else {
      const n = names.find(n => e.message === restoredMessage(n));
      if (n) frozen.delete(n);
    }
  }
  return frozen;
}

/** Map of currently frozen users. Pass a transaction as `x` with fresh=true to read inside it without the cache. */
export async function frozenUsers(x = db, { fresh = false } = {}) {
  if (fresh) return read(x);
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  loading ||= read(db).then(m => { cache = m; loadedAt = Date.now(); return m; }).finally(() => { loading = null; });
  return loading;
}

/** Call after a freeze or unfreeze has been committed. */
export const forgetFrozen = () => { cache = null; };
