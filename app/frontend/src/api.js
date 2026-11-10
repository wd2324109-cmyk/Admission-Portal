


const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
let token = localStorage.getItem('token');
export const setToken = t => { token = t; t ? localStorage.setItem('token', t) : (localStorage.removeItem('token'), localStorage.removeItem('user')); };
export const savedUser = () => { try { return token ? JSON.parse(localStorage.getItem('user')) : null; } catch { return null; } };
export const saveUser = u => localStorage.setItem('user', JSON.stringify(u));


export const peekLogoutReason = () => sessionStorage.getItem('logoutReason') || '';
export const clearLogoutReason = () => sessionStorage.removeItem('logoutReason');

export async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: opts.body && JSON.stringify(opts.body) });
  const data = await r.json().catch(() => ({}));

  if (r.status === 401 && path !== '/auth/login' && path !== '/auth/logout') {
    if (token) sessionStorage.setItem('logoutReason', data.error || 'Your session has ended. Please sign in again.');
    setToken(null); window.location.reload();
  }
  if (!r.ok) { const e = new Error(data.error || 'Request failed'); e.code = data.code; e.data = data; throw e; }
  return data;
}

// A blob: URL runs with this site's own origin, so only ever open real documents (PDF or image), never HTML or script.
const SAFE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const safeBlob = b => { if (!SAFE_TYPES.includes(b.type)) throw new Error('This file type cannot be opened here.'); return b; };

export async function openFile(path) {                                                               
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not open file');
  window.open(URL.createObjectURL(safeBlob(await r.blob())), '_blank');
}

export async function fileBlob(path) {                                                          
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load file');
  return safeBlob(await r.blob());
}

export async function downloadFile(path) {                                                                                     
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Download failed');
  const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'download.xlsx';
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
}
