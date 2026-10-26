let token = localStorage.getItem('token');
export const setToken = t => { token = t; t ? localStorage.setItem('token', t) : (localStorage.removeItem('token'), localStorage.removeItem('user')); };
export const savedUser = () => { try { return token ? JSON.parse(localStorage.getItem('user')) : null; } catch { return null; } };
export const saveUser = u => localStorage.setItem('user', JSON.stringify(u));

export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: opts.body && JSON.stringify(opts.body) });
  const data = await r.json().catch(() => ({}));
                                                                                                                 
  if (r.status === 401 && !path.startsWith('/auth/')) { setToken(null); window.location.reload(); }
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function openFile(path) {                                                               
  const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not open file');
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}

export async function fileBlob(path) {                                                          
  const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load file');
  return r.blob();
}

export async function downloadFile(path) {                                                                                     
  const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Download failed');
  const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'download.xlsx';
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
}
