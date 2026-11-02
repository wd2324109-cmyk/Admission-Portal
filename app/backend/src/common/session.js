import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../schema/index.js';
import { db } from '../db/index.js';
import { frozenUsers } from './freeze.js';

















const BOOT = Date.now();
export const IDLE_SECONDS = +process.env.SESSION_IDLE_SECONDS || Math.max(1, +process.env.SESSION_IDLE_MINUTES || 30) * 60;
export const MAX_DEVICES = Math.max(1, +process.env.MAX_DEVICES_PER_USER || 20);
const IDLE_MS = IDLE_SECONDS * 1000, TOKEN_MS = 8 * 3600 * 1000;

const live = new Map();
const ended = new Map();
const notBefore = new Map();

export const SESSION_MSG = {
  ACCOUNT_FROZEN: 'Your access has been frozen by the administrator. Please contact them to restore it.',
  SESSION_ENDED: 'Your session has ended (signed out, or the password was changed). Please sign in again.',
  SESSION_EXPIRED: 'Your session expired after a period of inactivity. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  UNAUTHORIZED: 'Unauthorized',
};


export const pwStamp = hash => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);

const finish = sid => { live.delete(sid); ended.set(sid, Date.now() + TOKEN_MS); };
const devicesOf = userId => [...live].filter(([, s]) => s.userId === userId);

setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of live) if (now - s.lastSeen > TOKEN_MS) live.delete(sid);
  for (const [sid, until] of ended) if (until < now) ended.delete(sid);
}, 10 * 60 * 1000).unref();

export function startSession(userId) {
  const sid = crypto.randomUUID(), now = Date.now();
  for (const [id, s] of devicesOf(userId)) if (now - s.lastSeen > IDLE_MS) finish(id);
  const mine = devicesOf(userId).sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  while (mine.length >= MAX_DEVICES) finish(mine.shift()[0]);
  live.set(sid, { userId, lastSeen: now });
  return { sid, t: now };
}


export const endSession = (userId, sid) => finish(sid);


export const endOtherSessions = (userId, keepSid) => { for (const [id] of devicesOf(userId)) if (id !== keepSid) finish(id); };


export const endAllSessions = userId => { for (const [id] of devicesOf(userId)) finish(id); notBefore.set(userId, Date.now()); };


export function activeDevices() {
  const now = Date.now(), out = new Map();
  for (const s of live.values()) if (now - s.lastSeen <= IDLE_MS) out.set(s.userId, (out.get(s.userId) || 0) + 1);
  return out;
}

export async function checkSession(claims) {
  if (!claims?.id || !claims?.sid || !claims?.pv) return { ok: false, code: 'SESSION_ENDED' };
  const [r] = await db.select({ id: users.id, username: users.username, role: users.role, region: users.region, district: users.district, passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, claims.id));
  if (r && (await frozenUsers()).has(r.username)) return { ok: false, code: 'ACCOUNT_FROZEN' };
  if (!r || claims.pv !== pwStamp(r.passwordHash)) return { ok: false, code: 'SESSION_ENDED' };
  if (ended.has(claims.sid) || !(claims.t >= Math.max(BOOT, notBefore.get(r.id) || 0))) return { ok: false, code: 'SESSION_ENDED' };
  const now = Date.now(), s = live.get(claims.sid);
  if (s && now - s.lastSeen > IDLE_MS) { finish(claims.sid); return { ok: false, code: 'SESSION_EXPIRED' }; }
  if (s) s.lastSeen = now; else live.set(claims.sid, { userId: r.id, lastSeen: now });
  return { ok: true, user: { id: r.id, username: r.username, role: r.role, region: r.region, district: r.district, sid: claims.sid } };
}
