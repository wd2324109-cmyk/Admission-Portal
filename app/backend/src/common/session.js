import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../schema/index.js';
import { db } from '../db/index.js';
import { frozenUsers } from './freeze.js';

/*
 * Many devices, one account - without a sessions table.
 *
 * Every sign-in gets its own random session id (sid) inside a signed token, so a user can be signed in on any
 * number of computers at once and each device is independent:
 *   - logging out on one device ends only that device,
 *   - a device that is idle for SESSION_IDLE_MINUTES (default 30) expires on its own,
 *   - changing the password signs out every other device: the token carries a stamp of the password hash,
 *     and a token whose stamp no longer matches the users table is refused,
 *   - freezing a user (see common/freeze.js) refuses every request of that user at once.
 *
 * Idle time and "ended" devices are tracked in this server's memory, so that memory is lost when the server restarts.
 * HOSTING FIX: a token issued before this server started is therefore refused (BOOT below). Otherwise a token that
 * was signed out (or had gone idle) would become valid again after every restart / redeploy / free-plan wake-up.
 * Effect for users: after a restart everyone signs in once more. Nothing needs to be stored in the database.
 */
const BOOT = Date.now();
export const IDLE_SECONDS = +process.env.SESSION_IDLE_SECONDS || Math.max(1, +process.env.SESSION_IDLE_MINUTES || 30) * 60;
export const MAX_DEVICES = Math.max(1, +process.env.MAX_DEVICES_PER_USER || 20);   // runaway-protection only
const IDLE_MS = IDLE_SECONDS * 1000, TOKEN_MS = 8 * 3600 * 1000;

const live = new Map();        // sid -> { userId, lastSeen }
const ended = new Map();       // sid -> time after which the token has expired anyway
const notBefore = new Map();   // userId -> tokens issued before this moment are refused

export const SESSION_MSG = {
  ACCOUNT_FROZEN: 'Your access has been frozen by the administrator. Please contact them to restore it.',
  SESSION_ENDED: 'Your session has ended (signed out, or the password was changed). Please sign in again.',
  SESSION_EXPIRED: 'Your session expired after a period of inactivity. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  UNAUTHORIZED: 'Unauthorized',
};

/** Short stamp of a password hash; it is put in the token so a password change invalidates old tokens. */
export const pwStamp = hash => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);

const finish = sid => { live.delete(sid); ended.set(sid, Date.now() + TOKEN_MS); };
const devicesOf = userId => [...live].filter(([, s]) => s.userId === userId);

setInterval(() => {                                         // housekeeping: forget what can no longer matter
  const now = Date.now();
  for (const [sid, s] of live) if (now - s.lastSeen > TOKEN_MS) live.delete(sid);
  for (const [sid, until] of ended) if (until < now) ended.delete(sid);
}, 10 * 60 * 1000).unref();

export function startSession(userId) {
  const sid = crypto.randomUUID(), now = Date.now();
  for (const [id, s] of devicesOf(userId)) if (now - s.lastSeen > IDLE_MS) finish(id);
  const mine = devicesOf(userId).sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  while (mine.length >= MAX_DEVICES) finish(mine.shift()[0]);   // oldest activity goes first
  live.set(sid, { userId, lastSeen: now });
  return { sid, t: now };
}

/** Ends only the given device. */
export const endSession = (userId, sid) => finish(sid);

/** Ends every device except `keepSid`. */
export const endOtherSessions = (userId, keepSid) => { for (const [id] of devicesOf(userId)) if (id !== keepSid) finish(id); };

/** Ends every device of the user, including tokens that this server has not seen (used when freezing). */
export const endAllSessions = userId => { for (const [id] of devicesOf(userId)) finish(id); notBefore.set(userId, Date.now()); };

/** How many devices of each user are active right now: Map(userId -> count). */
export function activeDevices() {
  const now = Date.now(), out = new Map();
  for (const s of live.values()) if (now - s.lastSeen <= IDLE_MS) out.set(s.userId, (out.get(s.userId) || 0) + 1);
  return out;
}

export async function checkSession(claims) {
  if (!claims?.id || !claims?.sid || !claims?.pv) return { ok: false, code: 'SESSION_ENDED' };       // tokens issued before this version
  const [r] = await db.select({ id: users.id, username: users.username, role: users.role, region: users.region, district: users.district, passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, claims.id));
  if (r && (await frozenUsers()).has(r.username)) return { ok: false, code: 'ACCOUNT_FROZEN' };      // takes effect on the very next request, on every device
  if (!r || claims.pv !== pwStamp(r.passwordHash)) return { ok: false, code: 'SESSION_ENDED' };
  if (ended.has(claims.sid) || !(claims.t >= Math.max(BOOT, notBefore.get(r.id) || 0))) return { ok: false, code: 'SESSION_ENDED' };
  const now = Date.now(), s = live.get(claims.sid);
  if (s && now - s.lastSeen > IDLE_MS) { finish(claims.sid); return { ok: false, code: 'SESSION_EXPIRED' }; }
  if (s) s.lastSeen = now; else live.set(claims.sid, { userId: r.id, lastSeen: now });                   // unknown here = server restarted: accept and start the idle clock
  return { ok: true, user: { id: r.id, username: r.username, role: r.role, region: r.region, district: r.district, sid: claims.sid } };
}
