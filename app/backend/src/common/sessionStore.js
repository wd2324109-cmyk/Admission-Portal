// Sessions and sign-in profiles live in the "access" table (columns "User", "Class_level", "tag"), because the production
// database has no users table. Nothing is stored in a password column: everyone signs in with MSMS.
//
//   tag SESSION   Class_level = the account's session id (one per user, kept across sign-ins on many devices)
//   tag PROFILE   Class_level = {"role","region","district"} as JSON, refreshed at every sign-in (the Users page reads it)
//   tag ACTIVE    Class_level = "9" / "10"  (class access, unchanged)
//   tag FROZEN / UNFROZEN   Class_level = time in ms (see freeze.js); rows are only ever added, never changed or deleted
import { and, eq } from 'drizzle-orm';
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
  return rows.map(r => String(r.classLevel)).sort()[0];
}

export async function hasSession(username, sid) {
  if (!username || !sid) return false;
  return (await sessionRows(db, username)).some(r => String(r.classLevel) === String(sid));
}

// The account's session ids. Freezing does not remove them (the login cannot delete rows); a frozen login is refused on every request instead.
export const sessionIds = async username => (await sessionRows(db, username)).map(r => String(r.classLevel));

// True when this username has never been seen before (no row of any kind in the access table).
export async function isFirstSignIn(username) {
  const rows = await db.select({ t: access.tag }).from(access).where(eq(access.user, username)).limit(1);
  return rows.length === 0;
}

// Best effort: the sign-in must not fail because the profile row could not be written.
export async function saveProfile({ username, role, region, district }) {
  try {
    const next = { role: role ?? null, region: region ?? null, district: district ?? null };
    const old = latestProfile(await db.select().from(access).where(and(eq(access.user, username), eq(access.tag, PROFILE_TAG))));
    if (old && ['role', 'region', 'district'].every(k => (old[k] ?? null) === next[k])) return;
    // A new row is added only when something changed; the newest "at" wins when the profile is read.
    await db.insert(access).values({ user: username, classLevel: JSON.stringify({ ...next, at: Date.now() }), tag: PROFILE_TAG }).onConflictDoNothing();
  } catch (e) { console.warn(`Could not save the profile of "${username}":`, e?.message || e); }
}

function latestProfile(rows) {
  let best = null;
  for (const r of rows) {
    if (r.tag !== PROFILE_TAG) continue;
    let p; try { p = JSON.parse(r.classLevel); } catch { continue; }
    if (p && typeof p === 'object' && (!best || (+p.at || 0) >= (+best.at || 0))) best = p;
  }
  return best;
}
export const parseProfile = rows => latestProfile(rows) || {};
