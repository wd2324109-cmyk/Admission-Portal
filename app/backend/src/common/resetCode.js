import crypto from 'node:crypto';

// One-time reset codes handed over by the super admin. 10 characters from a 31-letter alphabet (about 50 bits; no 0/O/1/I/L,
// so they are easy to read out over the phone). Only a keyed hash is stored, so a database leak does not reveal usable codes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const part = () => Array.from({ length: 5 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
export const generateCode = () => `${part()}-${part()}`;
export const normalizeCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCode = (code, key) => crypto.createHmac('sha256', key).update(normalizeCode(code)).digest('hex');
export const codeMatches = (code, hash, key) => {
  const a = Buffer.from(hashCode(code, key), 'hex'), b = Buffer.from(String(hash || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
