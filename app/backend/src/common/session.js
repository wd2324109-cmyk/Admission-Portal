// One signed-in device per user, kept in the document's own column: users.session_id.
// Signing in writes a new session_id, which signs the user out everywhere else. The idle timeout is kept in memory
// (there is no last-seen column in the document): a server restart simply starts the idle clock again.
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../schema/index.js';
import { db } from '../db/index.js';

export const IDLE_SECONDS = +process.env.SESSION_IDLE_SECONDS || Math.max(1, +process.env.SESSION_IDLE_MINUTES || 30) * 60;
const IDLE_MS = IDLE_SECONDS * 1000;
const lastSeen = new Map();                                        // session id -> time of the last request

export const SESSION_MSG = {
  SESSION_ENDED: 'Your session has ended (you signed out, signed in on another device, or the password was changed). Please sign in again.',
  SESSION_EXPIRED: 'Your session expired after a period of inactivity. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  UNAUTHORIZED: 'Unauthorized',
};
export const pwStamp = hash => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);
export const newSessionId = () => crypto.randomUUID();
export const forget = sid => lastSeen.delete(sid);
setInterval(() => { const now = Date.now(); for (const [k, t] of lastSeen) if (now - t > IDLE_MS * 2) lastSeen.delete(k); }, 10 * 60 * 1000).unref();

export async function checkSession(claims) {
  if (!claims?.id || !claims?.sid || !claims?.pv) return { ok: false, code: 'SESSION_ENDED' };
  const [r] = await db.select().from(users).where(eq(users.id, claims.id));
  if (!r || r.sessionId !== claims.sid || claims.pv !== pwStamp(r.passwordHash)) return { ok: false, code: 'SESSION_ENDED' };
  const now = Date.now(), seen = lastSeen.get(claims.sid);
  if (seen && now - seen > IDLE_MS) { lastSeen.delete(claims.sid); return { ok: false, code: 'SESSION_EXPIRED' }; }
  lastSeen.set(claims.sid, now);
  return { ok: true, user: { id: r.id, username: r.username, role: r.role, region: r.region, district: r.district, sid: claims.sid } };
}
