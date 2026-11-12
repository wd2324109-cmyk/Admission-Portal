import bcrypt from 'bcryptjs';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { users, passwordResets as R } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { audit } from '../../common/audit.js';
import { KEY } from '../../common/auth.js';
import { HttpError } from '../../common/http.js';
import { makeLimiter } from '../../common/rateLimit.js';
import { checkNewPassword } from '../../common/password.js';
import { generateCode, hashCode, codeMatches } from '../../common/resetCode.js';
import { endAllSessions } from '../../common/session.js';
import { PasswordResetService } from '../passwordReset.service.js';

// Flow: the user asks (public, rate limited, never reveals whether a username exists) -> a super admin approves, which
// creates a one-time code shown to the super admin only -> the super admin passes the code to the user -> the user sets a new
// password with username + code. Nothing changes the password until a super admin has approved. Super admin accounts cannot
// be reset online at all (there is nobody above them to approve): see src/resetSuperadmin.js.
const OPEN = ['PENDING', 'APPROVED'];
const CODE_MS = Math.max(5, +process.env.PASSWORD_RESET_CODE_MINUTES || 60) * 60 * 1000;
const MAX_WRONG_CODES = 5, HOUR = 60 * 60 * 1000;
const reqByIp = makeLimiter({ max: 5, windowMs: HOUR }), reqByUser = makeLimiter({ max: 3, windowMs: HOUR });
const useByIp = makeLimiter({ max: 15 }), useByUser = makeLimiter({ max: 8 });
const GENERIC = 'If that username exists, a password reset request has been sent to the super admin for approval. You will be given a one-time code once it is approved.';
const BAD = 'The reset code is invalid or has expired. Ask the super admin for a new one.';
const tooMany = (...pairs) => { const hit = pairs.find(([l, k]) => l.blocked(k)); return hit ? new HttpError('Too many attempts. Try again later.', 429, { retryAfter: Math.max(...pairs.map(([l, k]) => l.retryAfter(k))) }) : null; };
const clean = (s, max = 300) => String(s || '').trim().slice(0, max);

export class PasswordResetServiceImpl extends PasswordResetService {
  async request({ body, ip }) {
    const name = clean(body?.username, 100);
    if (!name) throw new HttpError('Enter your username');
    const ipK = `rq|${ip}`, uK = `rq|${name.toLowerCase()}`;
    const block = tooMany([reqByIp, ipK], [reqByUser, uK]); if (block) throw block;
    reqByIp.fail(ipK); reqByUser.fail(uK);

    const [u] = await db.select().from(users).where(eq(users.username, name));
    if (u?.role === 'SUPER_ADMIN') {
      await audit(db, null, { action: 'PASSWORD_RESET_BLOCKED', level: 'WARN', actor: u.username, message: `An online password reset was requested from ${ip} for a super admin account and ignored` });
    } else if (u) {
      try {
        await db.transaction(async tx => {
          await tx.update(R).set({ status: 'EXPIRED' }).where(and(eq(R.userId, u.id), eq(R.status, 'APPROVED'), lt(R.expiresAt, new Date())));
          const [open] = await tx.select({ id: R.id }).from(R).where(and(eq(R.userId, u.id), inArray(R.status, OPEN)));
          if (open) return;
          await tx.insert(R).values({ userId: u.id, username: u.username, requestedAt: new Date(), requestedIp: String(ip).slice(0, 64) });
          await audit(tx, null, { action: 'PASSWORD_RESET_REQUESTED', actor: u.username, message: `Password reset requested from ${ip}` });
        });
      } catch (e) { if (e?.code !== '23505') throw e; }          // two requests at the same instant: the unique index keeps one
    }
    return { ok: true, message: GENERIC };
  }

  async list() {
    await db.update(R).set({ status: 'EXPIRED' }).where(and(eq(R.status, 'APPROVED'), lt(R.expiresAt, new Date())));
    const rows = await db.select({ id: R.id, username: R.username, status: R.status, requestedAt: R.requestedAt, requestedIp: R.requestedIp,
      decidedBy: R.decidedBy, decidedAt: R.decidedAt, decisionRemarks: R.decisionRemarks, expiresAt: R.expiresAt, completedAt: R.completedAt,
      role: users.role, region: users.region, district: users.district })
      .from(R).leftJoin(users, eq(users.id, R.userId)).orderBy(desc(R.id)).limit(200);       // never returns the code or its hash
    return { pending: rows.filter(r => r.status === 'PENDING').length, rows };
  }

  async approve({ user, params }) {
    const id = +params.id || 0; let code, expiresAt, username;
    await db.transaction(async tx => {
      const [r] = await tx.select().from(R).where(eq(R.id, id)).for('update');
      if (!r) throw new HttpError('Request not found', 404);
      if (r.status !== 'PENDING') throw new HttpError('This request is no longer pending', 409);
      const [u] = await tx.select().from(users).where(eq(users.id, r.userId)).for('update');
      if (!u) throw new HttpError('That user no longer exists', 404);
      if (u.role === 'SUPER_ADMIN') throw new HttpError('Super admin passwords cannot be reset online', 409);
      code = generateCode(); expiresAt = new Date(Date.now() + CODE_MS); username = u.username;
      await tx.update(R).set({ status: 'APPROVED', decidedBy: user.username, decidedAt: new Date(), codeHash: hashCode(code, KEY), expiresAt, attempts: 0 }).where(eq(R.id, id));
      await audit(tx, { user }, { action: 'PASSWORD_RESET_APPROVED', level: 'WARN', message: `Approved password reset for ${u.username}; the one-time code is valid for ${Math.round(CODE_MS / 60000)} minutes` });
    });
    return { ok: true, username, code, expiresAt: expiresAt.toISOString() };      // the only time the code is ever visible
  }

  async reject({ user, params, body }) {
    const id = +params.id || 0, remarks = clean(body?.remarks);
    await db.transaction(async tx => {
      const [r] = await tx.select().from(R).where(eq(R.id, id)).for('update');
      if (!r) throw new HttpError('Request not found', 404);
      if (!OPEN.includes(r.status)) throw new HttpError('This request is already closed', 409);
      await tx.update(R).set({ status: 'REJECTED', decidedBy: user.username, decidedAt: new Date(), decisionRemarks: remarks || null, codeHash: null }).where(eq(R.id, id));
      await audit(tx, { user }, { action: 'PASSWORD_RESET_REJECTED', message: `Rejected password reset for ${r.username}${remarks ? `: ${remarks}` : ''}` });
    });
    return { ok: true };
  }

  async complete({ body, ip }) {
    const name = clean(body?.username, 100), code = clean(body?.code, 40), pw = body?.newPassword;
    if (!name || !code || !pw) throw new HttpError('Username, reset code and new password are required');
    const ipK = `use|${ip}`, uK = `use|${name.toLowerCase()}`;
    const block = tooMany([useByIp, ipK], [useByUser, uK]); if (block) throw block;
    useByIp.fail(ipK);

    let failed = false, userId;
    await db.transaction(async tx => {
      const [u] = await tx.select().from(users).where(eq(users.username, name));
      const [r] = u ? await tx.select().from(R).where(and(eq(R.userId, u.id), eq(R.status, 'APPROVED'))).for('update') : [];
      if (!u || !r || u.role === 'SUPER_ADMIN') { failed = true; return; }
      if (!r.expiresAt || r.expiresAt < new Date()) { await tx.update(R).set({ status: 'EXPIRED', codeHash: null }).where(eq(R.id, r.id)); failed = true; return; }
      if (!codeMatches(code, r.codeHash, KEY)) {
        const attempts = r.attempts + 1, locked = attempts >= MAX_WRONG_CODES;
        await tx.update(R).set(locked ? { attempts, status: 'REJECTED', codeHash: null, decisionRemarks: 'Locked after too many wrong codes' } : { attempts }).where(eq(R.id, r.id));
        await audit(tx, null, { action: 'PASSWORD_RESET_FAILED', level: 'WARN', actor: u.username, message: `Wrong reset code from ${ip}${locked ? '; the request is now locked' : ''}` });
        failed = true; return;
      }
      checkNewPassword(pw, u.username);                          // a weak password is refused without using up the code
      const hash = await bcrypt.hash(String(pw), 12);
      await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, u.id));
      await tx.update(R).set({ status: 'COMPLETED', completedAt: new Date(), codeHash: null }).where(eq(R.id, r.id));
      await audit(tx, null, { action: 'PASSWORD_RESET_COMPLETED', level: 'WARN', actor: u.username, message: `Password changed with an approved reset code from ${ip}; all sessions signed out` });
      userId = u.id;
    });
    if (failed) { useByUser.fail(uK); throw new HttpError(BAD, 400); }
    endAllSessions(userId); useByUser.clear(uK);
    return { ok: true };
  }
}
