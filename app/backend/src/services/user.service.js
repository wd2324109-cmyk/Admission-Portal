import { and, eq } from 'drizzle-orm';
import { access } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { ACTIVE } from '../common/access.js';
import { CLASSES } from '../common/studentStore.js';
import { freezeStates, freezeLogin, unfreezeLogin } from '../common/freeze.js';
import { forget, isSignedIn } from '../common/session.js';
import { sessionIds, parseProfile } from '../common/sessionStore.js';

const ROLE_ORDER = ['SUPER_ADMIN', 'STATE', 'REGION', 'DISTRICT'];
const classList = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(c => CLASSES.includes(c)))].sort();

export async function setAccess(tx, username, classes) {
  await tx.delete(access).where(and(eq(access.user, username), eq(access.tag, ACTIVE)));
  if (classes.length) await tx.insert(access).values(classes.map(c => ({ user: username, classLevel: String(c), tag: ACTIVE })));
}

// There is no users table. A person exists once MSMS has let them in: they have rows in the access table. The id used in the URLs is the username.
const rowsOf = async username => db.select().from(access).where(eq(access.user, username));
async function known(params) {
  const username = String(params?.id ?? '').trim();
  const rows = username ? await rowsOf(username) : [];
  if (!rows.length) throw new HttpError('User not found', 404);
  return { username, rows, profile: parseProfile(rows) };
}

export const userService = {
  async list() {
    const all = await db.select().from(access);
    const names = [...new Set(all.map(a => a.user).filter(Boolean))], locks = freezeStates(all);
    const rows = names.map(username => {
      const mine = all.filter(a => a.user === username), p = parseProfile(mine);
      return { id: username, username, role: p.role ?? null, region: p.region ?? null, district: p.district ?? null,
        signedIn: isSignedIn(username), frozen: !!locks.get(username)?.frozen,
        classes: mine.filter(a => a.tag === ACTIVE).map(a => +a.classLevel).sort() };
    });
    const rank = r => { const i = ROLE_ORDER.indexOf(r.role); return i < 0 ? ROLE_ORDER.length : i; };
    return rows.sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username));
  },
  async create() {
    throw new HttpError('Accounts are not created here. Everyone signs in with MSMS and appears in this list after the first sign-in.', 409);
  },
  async resetPassword() {
    throw new HttpError('Every user signs in with MSMS. The password is changed there.', 409);
  },
  async freeze({ params, user }) {
    const { username, profile } = await known(params);
    if (username === user?.username) throw new HttpError('You cannot freeze your own login', 409);
    if (profile.role && profile.role !== 'DISTRICT') throw new HttpError('Only a DMS (district) login can be frozen', 409);
    await freezeLogin(username);
    for (const sid of await sessionIds(username)) forget(sid);
    return { ok: true };
  },
  async unfreeze({ params }) {
    const { username } = await known(params);
    await unfreezeLogin(username);
    return { ok: true };
  },
  async setAccess({ params, body }) {
    const { username } = await known(params);
    await db.transaction(tx => setAccess(tx, username, classList(body?.classes)));
    return { ok: true };
  },
};
