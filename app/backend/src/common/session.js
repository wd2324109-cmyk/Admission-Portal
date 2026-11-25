import crypto from 'node:crypto';
import { isFrozen, FROZEN_MSG } from './freeze.js';
import { hasSession } from './sessionStore.js';

export const IDLE_SECONDS = +process.env.SESSION_IDLE_SECONDS || Math.max(1, +process.env.SESSION_IDLE_MINUTES || 30) * 60;
const IDLE_MS = IDLE_SECONDS * 1000;
// One login can be open on any number of devices. Each device has its own id (did): idle time and sign-out are tracked per device,
// while the account-level session id (an access row tagged SESSION, see sessionStore.js) only changes when the login is frozen.
const lastSeen = new Map();   // device id -> { t, uid, sid }
const ended = new Map();      // device ids that signed out -> time their token expires anyway
const TOKEN_MS = 8 * 60 * 60 * 1000 + 60 * 1000;

export const SESSION_MSG = {
  SESSION_ENDED: 'Your session has ended (you signed out, the password was changed or the login was frozen). Please sign in again.',
  SESSION_EXPIRED: 'Your session expired after a period of inactivity. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  ACCOUNT_FROZEN: FROZEN_MSG,
  UNAUTHORIZED: 'Unauthorized',
};
export const pwStamp = hash => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);
export const newSessionId = () => crypto.randomUUID();
export const newDeviceId = () => crypto.randomUUID();
export const forget = sid => { for (const [k, v] of lastSeen) if (v.sid === sid) lastSeen.delete(k); };
export const endDevice = did => { if (!did) return; lastSeen.delete(did); ended.set(did, Date.now() + TOKEN_MS); };
export const isSignedIn = uid => { const now = Date.now(); for (const v of lastSeen.values()) if (v.uid === uid && now - v.t <= IDLE_MS) return true; return false; };
setInterval(() => { const now = Date.now(); for (const [k, v] of lastSeen) if (now - v.t > IDLE_MS * 2) lastSeen.delete(k); for (const [k, t] of ended) if (now > t) ended.delete(k); }, 10 * 60 * 1000).unref();

export async function checkSession(claims) {
  const username = claims?.username;
  if (!username || !claims?.sid) return { ok: false, code: 'SESSION_ENDED' };
  if (await isFrozen(username)) return { ok: false, code: 'ACCOUNT_FROZEN' };
  if (!(await hasSession(username, claims.sid))) return { ok: false, code: 'SESSION_ENDED' };
  const key = claims.did || claims.sid;
  if (ended.has(key)) return { ok: false, code: 'SESSION_ENDED' };
  const now = Date.now(), seen = lastSeen.get(key);
  if (seen && now - seen.t > IDLE_MS) { lastSeen.delete(key); return { ok: false, code: 'SESSION_EXPIRED' }; }
  lastSeen.set(key, { t: now, uid: username, sid: claims.sid });
  return { ok: true, user: { id: username, username, name: claims.name || null, role: claims.role, region: claims.region ?? null, district: claims.district ?? null, sid: claims.sid, did: claims.did } };
}
