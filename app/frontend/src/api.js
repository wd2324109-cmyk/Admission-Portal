// HOSTING FIX: address of the API. Empty (the default) = same address as this site, which is right when the backend
// serves the frontend or the host forwards /api. Only for separate hosting, build with VITE_API_URL=https://api.example
// (and set CORS_ORIGIN on the backend to this site's address).
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
let token = localStorage.getItem('token');
export const setToken = t => { token = t; t ? localStorage.setItem('token', t) : (localStorage.removeItem('token'), localStorage.removeItem('user')); };
export const savedUser = () => { try { return token ? JSON.parse(localStorage.getItem('user')) : null; } catch { return null; } };
export const saveUser = u => localStorage.setItem('user', JSON.stringify(u));

// Why the user was signed out (shown on the login screen after the reload)
export const peekLogoutReason = () => sessionStorage.getItem('logoutReason') || '';
export const clearLogoutReason = () => sessionStorage.removeItem('logoutReason');

export async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: opts.body && JSON.stringify(opts.body) });
  const data = await r.json().catch(() => ({}));
  // 401 anywhere except the sign-in / sign-out calls means the session is gone: signed in on another device, expired, or ended.
  if (r.status === 401 && path !== '/auth/login' && path !== '/auth/logout') {
    if (token) sessionStorage.setItem('logoutReason', data.error || 'Your session has ended. Please sign in again.');
    setToken(null); window.location.reload();
  }
  if (!r.ok) { const e = new Error(data.error || 'Request failed'); e.code = data.code; e.data = data; throw e; }
  return data;
}

export async function openFile(path) {                                                               
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not open file');
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}

export async function fileBlob(path) {                                                          
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load file');
  return r.blob();
}

export async function downloadFile(path) {                                                                                     
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Download failed');
  const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'download.xlsx';
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
}
