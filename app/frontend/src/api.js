// API client. Same exports and endpoint paths as before, hardened:
//  - the sign-in token lives in sessionStorage (cleared when the tab closes), never in persistent localStorage
//  - every request has a timeout, so a stalled network cannot leave the screen hanging
//  - clear messages for offline, timeout and rate-limit (429) cases
//  - documents open with noopener and their temporary blob: URLs are released afterwards
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

// sessionStorage can be blocked (private mode, strict policies): fall back to memory instead of crashing.
const mem = new Map();
const store = (() => { try { const k = '__probe'; sessionStorage.setItem(k, '1'); sessionStorage.removeItem(k); return sessionStorage; } catch { return null; } })();
const read = k => (store ? store.getItem(k) : mem.get(k) ?? null);
const write = (k, v) => { if (store) store.setItem(k, v); else mem.set(k, v); };
const drop = k => { if (store) store.removeItem(k); else mem.delete(k); };

// Older versions kept the token in localStorage, where it survived browser restarts. Remove any leftover copy.
try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* ignore */ }

let token = read('token');
export const hasToken = () => !!token;
export const setToken = t => { token = t; if (t) write('token', t); else { drop('token'); drop('user'); } };
export const savedUser = () => { try { return token ? JSON.parse(read('user')) : null; } catch { return null; } };
export const saveUser = u => write('user', JSON.stringify(u));

export const peekLogoutReason = () => read('logoutReason') || '';
export const clearLogoutReason = () => drop('logoutReason');
export const setLogoutReason = msg => write('logoutReason', msg);

// Time of the last request that reached the server. The idle guard uses it to keep the server session alive
// only while the person is actually working.
let lastApiAt = Date.now();
export const lastApiCall = () => lastApiAt;

// Imports, exports and selection runs can legitimately take a while; everything else should answer quickly.
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

const authHeader = () => (token ? { Authorization: 'Bearer ' + token } : {});

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
    if (token) setLogoutReason(data.error || 'Your session has ended. Please sign in again.');
    setToken(null); window.location.reload();
  }
  if (!r.ok) { const e = new Error(messageFor(r.status, data, 'Request failed')); e.code = data.code; e.status = r.status; e.data = data; throw e; }
  return data;
}

// A blob: URL runs with this site's own origin, so only ever open real documents (PDF or image), never HTML or script.
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

// Only a plain file name from the server is used: no path segments, no control characters.
const cleanName = n => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'download.xlsx';

export async function downloadFile(path) {
  const r = await getFile(path, 'Download failed');
  const name = cleanName(/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1]);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}
