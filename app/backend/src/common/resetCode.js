import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const part = () => Array.from({ length: 5 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
export const generateCode = () => `${part()}-${part()}`;
export const normalizeCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCode = (code, key) => crypto.createHmac('sha256', key).update(normalizeCode(code)).digest('hex');
export const codeMatches = (code, hash, key) => {
  const a = Buffer.from(hashCode(code, key), 'hex'), b = Buffer.from(String(hash || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
