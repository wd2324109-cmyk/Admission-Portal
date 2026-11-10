import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { checkSession, SESSION_MSG } from './session.js';


const isProd = process.env.NODE_ENV === 'production';
let secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  const why = !secret ? 'JWT_SECRET is not set' : 'JWT_SECRET is shorter than 32 characters';
  const fix = `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;
  if (isProd) { console.error(`${why}. Generate one with: ${fix}`); process.exit(1); }
  console.warn(`WARNING: ${why}. Generate one with: ${fix}`);
  if (!secret) secret = crypto.randomBytes(48).toString('hex');
} else if (isProd && (/\s/.test(secret) || new Set(secret).size < 12)) {
  // A readable phrase (spaces, few distinct characters) is guessable offline from any token. Random hex/base64 passes.
  console.error('JWT_SECRET looks like a typed phrase, not a random key. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
} else if (/\s/.test(secret) || new Set(secret).size < 12) {
  console.warn('WARNING: JWT_SECRET looks like a typed phrase, not a random key. Production will refuse to start with it.');
}
export const SECRET = secret;
export const KEY = secret;

export const signToken = profile => jwt.sign(profile, KEY, { algorithm: 'HS256', expiresIn: '8h' });
export const verifyToken = token => jwt.verify(token, KEY, { algorithms: ['HS256'] });

export const auth = async (req, res, next) => {
  let claims;
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new Error('no token');
    claims = verifyToken(h.slice(7));
  } catch (e) {
    const code = e?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    return res.status(401).json({ error: SESSION_MSG[code], code });
  }
  try {
    const r = await checkSession(claims);
    if (!r.ok) return res.status(401).json({ error: SESSION_MSG[r.code], code: r.code });
    req.user = r.user;
    next();
  } catch (e) { next(e); }
};
export const only = (...roles) => {
  const guard = (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' });
  guard.roles = roles;   // lets routes.test.js check which roles each route allows
  return guard;
};
