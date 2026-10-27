import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { users, userSessions as SS } from '../schema/index.js';
import { db } from '../db/index.js';

/*
 * Many devices, one account.
 *
 * Every sign-in creates its own row in user_sessions, so a user can be signed in on any number of
 * computers at the same time and each device is completely independent:
 *   - logging out on one device ends only that device,
 *   - an idle device expires on its own (SESSION_IDLE_MINUTES, default 30) without affecting the others,
 *   - changing the password signs out all OTHER devices (security) and keeps the current one.
 * Safety of the data itself does not depend on who is signed in where: every write is locked and
 * re-validated in the database (see common/locks.js), so simultaneous users cannot corrupt each other.
 *
 * All time comparisons use the database clock so several app servers agree.
 */
export const IDLE_SECONDS = Math.max(1, +process.env.SESSION_IDLE_MINUTES || 30) * 60;
export const MAX_DEVICES = Math.max(1, +process.env.MAX_DEVICES_PER_USER || 20);   // runaway-protection only
const TOUCH_SECONDS = 20;
const secs = n => sql`(${n}::double precision * interval '1 second')`;

export const SESSION_MSG = {
  ACCOUNT_FROZEN: 'Your access has been frozen by the administrator. Please contact them to restore it.',
  SESSION_ENDED: 'Your session has ended (signed out, or the password was changed). Please sign in again.',
  SESSION_EXPIRED: 'Your session expired after a period of inactivity. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  UNAUTHORIZED: 'Unauthorized',
};

export async function startSession(userId, { ip = null, agent = null } = {}) {
  const sid = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(SS).values({ id: sid, userId, ip, userAgent: agent ? String(agent).slice(0, 300) : null });
    // housekeeping: forget this user's dead sessions, and cap the number of live ones (oldest activity goes first)
    await tx.delete(SS).where(and(eq(SS.userId, userId), sql`${SS.lastSeen} < now() - ${secs(IDLE_SECONDS)}`));
    await tx.execute(sql`delete from user_sessions where user_id = ${userId} and id in
      (select id from user_sessions where user_id = ${userId} order by last_seen desc offset ${MAX_DEVICES})`);
  });
  return { sid };
}

/** Ends only the given device. */
export const endSession = (userId, sid) => db.delete(SS).where(and(eq(SS.userId, userId), eq(SS.id, sid)));

/** Ends every device except `keepSid`. */
export const endOtherSessions = (userId, keepSid, tx = db) => tx.delete(SS).where(and(eq(SS.userId, userId), sql`${SS.id} <> ${keepSid}`));

export async function checkSession(claims) {
  if (!claims?.id || !claims?.sid) return { ok: false, code: 'SESSION_ENDED' };       // tokens issued before sessions existed
  const [r] = await db.select({ id: users.id, username: users.username, role: users.role, region: users.region, district: users.district,
      frozenAt: users.frozenAt, sid: SS.id,
      alive: sql`${SS.lastSeen} > now() - ${secs(IDLE_SECONDS)}`,
      stale: sql`${SS.lastSeen} < now() - ${secs(TOUCH_SECONDS)}` })
    .from(users).leftJoin(SS, and(eq(SS.id, claims.sid), eq(SS.userId, users.id))).where(eq(users.id, claims.id));
  if (r?.frozenAt) return { ok: false, code: 'ACCOUNT_FROZEN' };      // takes effect on the very next request, on every device
  if (!r || !r.sid) return { ok: false, code: 'SESSION_ENDED' };
  if (!r.alive) return { ok: false, code: 'SESSION_EXPIRED' };
  if (r.stale) await db.update(SS).set({ lastSeen: sql`now()` }).where(eq(SS.id, claims.sid));
  return { ok: true, user: { id: r.id, username: r.username, role: r.role, region: r.region, district: r.district, sid: claims.sid } };
}
