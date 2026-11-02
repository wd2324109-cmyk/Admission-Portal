import { asc, inArray } from 'drizzle-orm';
import { auditLogs as A, users } from '../schema/index.js';
import { db } from '../db/index.js';











const TTL_MS = 5000;
export const frozenMessage = (username, reason) => `Access frozen for ${username}: ${reason}`;
export const restoredMessage = username => `Access restored for ${username}`;

let cache = null, loadedAt = 0, loading = null;

async function read(x) {
  const [us, events] = await Promise.all([
    x.select({ username: users.username }).from(users),
    x.select({ action: A.action, message: A.message, actor: A.actor, at: A.at }).from(A).where(inArray(A.action, ['FREEZE', 'UNFREEZE'])).orderBy(asc(A.id))]);
  const names = us.map(u => u.username).sort((a, b) => b.length - a.length);
  const frozen = new Map();
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


export async function frozenUsers(x = db, { fresh = false } = {}) {
  if (fresh) return read(x);
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  loading ||= read(db).then(m => { cache = m; loadedAt = Date.now(); return m; }).finally(() => { loading = null; });
  return loading;
}


export const forgetFrozen = () => { cache = null; };
