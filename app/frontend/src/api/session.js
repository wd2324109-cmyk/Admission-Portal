const mem = new Map();
const store = (() => {
  try { const k = '__probe'; sessionStorage.setItem(k, '1'); sessionStorage.removeItem(k); return sessionStorage; } catch { return null; }
})();
const read = k => (store ? store.getItem(k) : mem.get(k) ?? null);
const write = (k, v) => { if (store) store.setItem(k, v); else mem.set(k, v); };
const drop = k => { if (store) store.removeItem(k); else mem.delete(k); };

try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch {  }

let token = read('token');
export const getToken = () => token;
export const hasToken = () => !!token;
export const setToken = t => { token = t; if (t) write('token', t); else { drop('token'); drop('user'); } };
export const savedUser = () => { try { return token ? JSON.parse(read('user')) : null; } catch { return null; } };
export const saveUser = u => write('user', JSON.stringify(u));

export const peekLogoutReason = () => read('logoutReason') || '';
export const clearLogoutReason = () => drop('logoutReason');
export const setLogoutReason = msg => write('logoutReason', msg);
