import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { users, access } from '../schema/index.js';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { randPw } from '../common/excel.js';
import { ACTIVE } from '../common/access.js';
import { CLASSES } from '../common/studentStore.js';

const ROLE = ['SUPER_ADMIN', 'STATE', 'REGION', 'DISTRICT'];
const classList = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(c => CLASSES.includes(c)))].sort();

export async function setAccess(tx, username, classes) {
  await tx.delete(access).where(eq(access.user, username));
  if (classes.length) await tx.insert(access).values(classes.map(c => ({ user: username, classLevel: String(c), tag: ACTIVE })));
}

export const userService = {
  async list() {
    const [rows, acc] = await Promise.all([
      db.select({ id: users.id, username: users.username, role: users.role, region: users.region, district: users.district, sessionId: users.sessionId }).from(users).orderBy(asc(users.role), asc(users.username)),
      db.select().from(access)]);
    return rows.map(({ sessionId, ...u }) => ({ ...u, signedIn: !!sessionId, classes: acc.filter(a => a.user === u.username && a.tag === ACTIVE).map(a => +a.classLevel).sort() }));
  },
  async create({ body }) {
    const { username, role, region, district } = body || {};
    const name = String(username || '').trim();
    if (!/^[A-Za-z0-9_.-]{3,60}$/.test(name)) throw new HttpError('Username: 3 to 60 letters, digits, dot, dash or underscore');
    if (!ROLE.includes(role)) throw new HttpError('Choose a role');
    if (role === 'DISTRICT' && !String(district || '').trim()) throw new HttpError('A DMS (district) user needs a district');
    if (role === 'REGION' && !String(region || '').trim()) throw new HttpError('A regional coordinator needs a region: one district name, or several separated by commas');
    const classes = classList(body.classes), password = randPw();
    await db.transaction(async tx => {
      if ((await tx.select({ id: users.id }).from(users).where(eq(users.username, name))).length) throw new HttpError('This username already exists', 409);
      await tx.insert(users).values({ username: name, passwordHash: bcrypt.hashSync(password, 10), role, region: role === 'REGION' ? String(region).trim().toUpperCase() : null, district: role === 'DISTRICT' ? String(district).trim().toUpperCase() : null });
      await setAccess(tx, name, classes);
    });
    return { ok: true, username: name, password };
  },
  async resetPassword({ params }) {
    const [u] = await db.select().from(users).where(eq(users.id, +params.id || 0));
    if (!u) throw new HttpError('User not found', 404);
    const password = randPw();
    await db.update(users).set({ passwordHash: bcrypt.hashSync(password, 10), sessionId: null }).where(eq(users.id, u.id));
    return { ok: true, username: u.username, password };
  },
  async setAccess({ params, body }) {
    const [u] = await db.select().from(users).where(eq(users.id, +params.id || 0));
    if (!u) throw new HttpError('User not found', 404);
    await db.transaction(tx => setAccess(tx, u.username, classList(body?.classes)));
    return { ok: true };
  },
};
