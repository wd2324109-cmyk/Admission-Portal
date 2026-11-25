import { access } from '../schema/index.js';
import { db } from '../db/index.js';
import { signToken } from '../common/auth.js';
import { newDeviceId, endDevice } from '../common/session.js';
import { ensureSession, isFirstSignIn, saveProfile } from '../common/sessionStore.js';
import { HttpError } from '../common/http.js';
import { makeLimiter } from '../common/rateLimit.js';
import { classesOf, ACTIVE } from '../common/access.js';
import { msmsSignIn } from '../common/msms.js';
import { CLASSES } from '../common/studentStore.js';
import { isFrozen, FROZEN_MSG } from '../common/freeze.js';

const byUser = makeLimiter({ max: 8 }), byIp = makeLimiter({ max: 30 });
const DEFAULT_CLASSES = String(process.env.MSMS_DEFAULT_CLASSES ?? '9,10').split(',').map(Number).filter(c => CLASSES.includes(c));
// The token carries the profile from MSMS (role, region, district). There is no users table: the id is the username.
const profileOf = (u, name = null) => ({ id: u.username, username: u.username, name, role: u.role, region: u.region ?? null, district: u.district ?? null });

export const authService = {
  async login({ body, ip }) {
    const { username, password } = body || {};
    if (!username || !password) throw new HttpError('Username and password are required');
    const name = String(username).slice(0, 100), userKey = `${ip}|${name.toLowerCase()}`, ipKey = `ip|${ip}`;
    if (byUser.blocked(userKey) || byIp.blocked(ipKey))
      throw new HttpError('Too many failed attempts. Try again later.', 429, { retryAfter: Math.max(byUser.retryAfter(userKey), byIp.retryAfter(ipKey)) });
    let p;
    try { p = await msmsSignIn(name.trim(), String(password)); }
    catch (e) { if (e.status === 401) { byUser.fail(userKey); byIp.fail(ipKey); console.warn(`Failed MSMS sign-in for "${name}" from ${ip}`); } throw e; }
    byUser.clear(userKey);
    const u = { username: p.username, role: p.role, region: p.region, district: p.district };
    if (await isFrozen(u.username, { fresh: true })) throw new HttpError(FROZEN_MSG, 403, { code: 'ACCOUNT_FROZEN' });
    // A person seen for the first time gets the default class access (a super admin sees every class without it).
    if (await isFirstSignIn(u.username) && DEFAULT_CLASSES.length && u.role !== 'SUPER_ADMIN')
      await db.insert(access).values(DEFAULT_CLASSES.map(c => ({ user: u.username, classLevel: String(c), tag: ACTIVE }))).onConflictDoNothing();
    // The account session id is kept if there is one, so signing in again does not end the other devices; this device gets its own id.
    const sid = await ensureSession(u.username);
    await saveProfile(u);
    const did = newDeviceId(), profile = profileOf(u, p.name);
    return { token: signToken({ ...profile, sid, did, t: Date.now() }), user: { ...profile, classes: await classesOf(profile) } };
  },
  async logout({ user }) {
    endDevice(user.did);
    return { ok: true };
  },
  async session({ user }) { const { sid, did, ...profile } = user; return { ok: true, user: { ...profile, classes: await classesOf(profile) } }; },
  async changePassword() {
    throw new HttpError('Your password is managed in MSMS. Change it there.', 403);
  },
};
