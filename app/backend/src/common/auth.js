import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';


const isProd = process.env.NODE_ENV === 'production';
let secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  const why = !secret ? 'JWT_SECRET is not set' : 'JWT_SECRET is shorter than 32 characters';
  const fix = `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;
  if (isProd) { console.error(`${why}. Generate one with: ${fix}`); process.exit(1); }
  console.warn(`WARNING: ${why}. Generate one with: ${fix}`);
  if (!secret) secret = crypto.randomBytes(48).toString('hex');
}
export const SECRET = secret;
export const KEY = secret;

export const signToken = profile => jwt.sign(profile, KEY, { algorithm: 'HS256', expiresIn: '8h' });
export const verifyToken = token => jwt.verify(token, KEY, { algorithms: ['HS256'] });

export const auth = (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new Error('no token');
    req.user = verifyToken(h.slice(7));
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};
export const only = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });
