import { getToken, setToken, setLogoutReason } from './session.js';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

let lastApiAt = Date.now();
export const lastApiCall = () => lastApiAt;

const SLOW = /^\/(import|export|selection)/;
const timeoutFor = path => (SLOW.test(path) ? 180000 : 45000);

async function send(path, init) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutFor(path));
  try {
    const r = await fetch(API + path, { ...init, signal: ctl.signal, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
    lastApiAt = Date.now();
    return r;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw new Error(navigator.onLine === false ? 'You appear to be offline. Check your connection and try again.' : 'Could not reach the server. Please try again.');
  } finally { clearTimeout(timer); }
}

const authHeader = () => (getToken() ? { Authorization: 'Bearer ' + getToken() } : {});

const messageFor = (status, data, fallback) => {
  if (status === 429) {
    const wait = Math.ceil(+data?.retryAfter || 0);
    return data?.error || `Too many requests. Please wait${wait ? ` ${wait > 90 ? Math.ceil(wait / 60) + ' minutes' : wait + ' seconds'}` : ' a moment'} and try again.`;
  }
  return data?.error || fallback;
};

export async function api(path, opts = {}) {
  const r = await send(path, { ...opts, headers: { 'Content-Type': 'application/json', ...authHeader() }, body: opts.body && JSON.stringify(opts.body) });
  const data = await r.json().catch(() => ({}));

  if (r.status === 401 && path !== '/auth/login' && path !== '/auth/logout') {
    if (getToken()) setLogoutReason(data.error || 'Your session has ended. Please sign in again.');
    setToken(null); window.location.reload();
  }
  if (!r.ok) { const e = new Error(messageFor(r.status, data, 'Request failed')); e.code = data.code; e.status = r.status; e.data = data; throw e; }
  return data;
}

const SAFE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const safeBlob = b => { if (!SAFE_TYPES.includes(b.type)) throw new Error('This file type cannot be opened here.'); return b; };

async function getFile(path, fallback) {
  const r = await send(path, { headers: authHeader() });
  if (!r.ok) throw new Error(messageFor(r.status, await r.json().catch(() => ({})), fallback));
  return r;
}

export async function openFile(path) {
  const url = URL.createObjectURL(safeBlob(await (await getFile(path, 'Could not open file')).blob()));
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) { URL.revokeObjectURL(url); throw new Error('Your browser blocked the new tab. Allow pop-ups for this portal and try again.'); }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

export async function fileBlob(path) {
  return safeBlob(await (await getFile(path, 'Could not load file')).blob());
}

const cleanName = n => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'download.xlsx';

export async function downloadFile(path) {
  const r = await getFile(path, 'Download failed');
  const name = cleanName(/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1]);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}
