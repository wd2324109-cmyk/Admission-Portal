import { HttpError } from './http.js';

export const checkNewPassword = (pw, username = '') => {
  const p = String(pw);
  if (p.length < 10) throw new HttpError('New password must be at least 10 characters');
  if (Buffer.byteLength(p, 'utf8') > 72) throw new HttpError('New password is too long (72 bytes at most)');
  if (username && p.toLowerCase().includes(String(username).toLowerCase())) throw new HttpError('New password must not contain the username');
};
