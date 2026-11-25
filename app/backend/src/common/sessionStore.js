// Sessions and sign-in profiles live in the "access" table (columns "User", "Class_level", "tag"), because the production
// database has no users table. Nothing is stored in a password column: everyone signs in with MSMS.
//
//   tag SESSION   Class_level = the account's session id (one per user, kept across sign-ins on many devices)
//   tag PROFILE   Class_level = {"role","region","district"} as JSON, refreshed at every sign-in (the Users page reads it)
//   tag ACTIVE    Class_level = "9" / "10"  (class access, unchanged)
//   tag FROZEN    Class_level = "*"         (frozen login, unchanged)
import { and, eq, inArray } from 'drizzle-orm';
import { access } from '../schema/index.js';
import { db } from '../db/index.js';
import crypto from 'node:crypto';

export const SESSION_TAG = 'SESSION', PROFILE_TAG = 'PROFILE';

const sessionRows = (x, username) => x.select().from(access).where(and(eq(access.user, username), eq(access.tag, SESSION_TAG)));

// The user's session id; created on first use. Two sign-ins at the same moment may both insert: the smallest id wins and the rest are removed.
export async function ensureSession(username) {
  let rows = await sessionRows(db, username);
  if (!rows.length) {
    await db.insert(access).values({ user: username, classLevel: crypto.randomUUID(), tag: SESSION_TAG }).onConflictDoNothing();
    rows = await sessionRows(db, username);
  }
  const ids = rows.map(r => String(r.classLevel)).sort();
  if (ids.length > 1) await db.delete(access).where(and(eq(access.user, username), eq(access.tag, SESSION_TAG), inArray(access.classLevel, ids.slice(1))));
  return ids[0];
}

export async function hasSession(username, sid) {
  if (!username || !sid) return false;
  return (await sessionRows(db, username)).some(r => String(r.classLevel) === String(sid));
}

// Ends the account session on every device (freeze, or an administrator action). Returns the ids that were removed.
export async function endSessions(username) {
  const rows = await sessionRows(db, username);
  await db.delete(access).where(and(eq(access.user, username), eq(access.tag, SESSION_TAG)));
  return rows.map(r => String(r.classLevel));
}

// True when this username has never been seen before (no row of any kind in the access table).
export async function isFirstSignIn(username) {
  const rows = await db.select({ t: access.tag }).from(access).where(eq(access.user, username)).limit(1);
  return rows.length === 0;
}

// Best effort: the sign-in must not fail because the profile row could not be written.
export async function saveProfile({ username, role, region, district }) {
  try {
    const json = JSON.stringify({ role: role ?? null, region: region ?? null, district: district ?? null });
    const old = await db.select().from(access).where(and(eq(access.user, username), eq(access.tag, PROFILE_TAG)));
    if (old.length === 1 && old[0].classLevel === json) return;
    await db.transaction(async tx => {
      await tx.delete(access).where(and(eq(access.user, username), eq(access.tag, PROFILE_TAG)));
      await tx.insert(access).values({ user: username, classLevel: json, tag: PROFILE_TAG });
    });
  } catch (e) { console.warn(`Could not save the profile of "${username}":`, e?.message || e); }
}

export const parseProfile = rows => {
  const r = rows.find(x => x.tag === PROFILE_TAG);
  if (!r) return {};
  try { const p = JSON.parse(r.classLevel); return p && typeof p === 'object' ? p : {}; } catch { return {}; }
};
