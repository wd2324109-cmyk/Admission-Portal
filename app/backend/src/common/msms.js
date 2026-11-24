import { HttpError } from './http.js';

const LOGIN_URL = process.env.MSMS_LOGIN_URL || 'https://qe5r30ot7h.execute-api.ap-south-1.amazonaws.com/api/login/msmslogin';
const REGION_URL = process.env.MSMS_REGION_URL || 'https://qkpovsx8ol.execute-api.ap-south-1.amazonaws.com/api/masters/school-region-details';
const TIMEOUT_MS = +process.env.MSMS_TIMEOUT_MS || 10000;
const REGION_TTL_MS = 10 * 60 * 1000;

export const norm = v => String(v ?? '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
const roleSet = (v, d) => new Set(String(v ?? d).split(',').map(norm).filter(Boolean));
const RC_ROLES = roleSet(process.env.MSMS_RC_ROLES, 'RC,REGIONAL COORDINATOR');
const STATE_ROLES = roleSet(process.env.MSMS_STATE_ROLES, 'PMU,SC,STATE COORDINATOR,STATE REGIONAL COORDINATOR');

export const decodeToken = token => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).userData || null; } catch { return null; }
};

export function resolveRole(d) {
  const tags = [norm(d?.userRole), norm(d?.staffType)];
  if (tags.some(t => RC_ROLES.has(t))) return 'REGION';
  if (tags.some(t => STATE_ROLES.has(t))) return 'STATE';
  if (d?.districtId !== null && d?.districtId !== undefined && String(d.districtId).trim() !== '') return 'DISTRICT';
  return null;
}

const call = async (url, init) => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    console.error('MSMS request failed:', e?.message || e);
    throw new HttpError('MSMS could not be reached right now. Please try again in a moment.', 502);
  }
};

export async function msmsLogin(username, password) {
  const res = await call(LOGIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ username, ref: password }) });
  if (res.status >= 500) throw new HttpError('MSMS could not be reached right now. Please try again in a moment.', 502);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) throw new HttpError('Invalid credentials', 401);
  const userData = decodeToken(data.token);
  if (!userData) throw new HttpError('MSMS returned a login that could not be read.', 502);
  return userData;
}

const rowsOf = (x, depth = 0) => {
  if (Array.isArray(x)) return x.length && typeof x[0] === 'object' ? x : null;
  if (!x || typeof x !== 'object' || depth > 3) return null;
  for (const v of Object.values(x)) { const r = rowsOf(v, depth + 1); if (r) return r; }
  return null;
};
const first = (o, keys) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '') return o[k]; return null; };
const NAME_KEYS = ['districtName', 'district_name', 'districtNameEn', 'district'];
const ID_KEYS = ['districtId', 'district_id', 'districtCode', 'district_code'];

export const districtsFrom = payload => {
  const rows = rowsOf(payload) || [];
  const explicit = rows.some(r => first(r, NAME_KEYS) !== null);
  const found = new Map();
  for (const r of rows) {
    const name = first(r, explicit ? NAME_KEYS : ['name']);
    const id = first(r, explicit ? ID_KEYS : ['id']);
    if (name === null) continue;
    found.set(id === null ? norm(name) : String(id).trim(), norm(name));
  }
  return [...found].map(([id, name]) => ({ id, name }));
};

const regionCache = new Map();
export async function regionDistricts(regionCode) {
  const code = String(regionCode ?? '').trim();
  if (!code) return [];
  const hit = regionCache.get(code);
  if (hit && Date.now() - hit.at < REGION_TTL_MS) return hit.list;
  const res = await call(`${REGION_URL}?regionCode=${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new HttpError('MSMS could not give the districts of your region right now. Please try again in a moment.', 502);
  const list = districtsFrom(await res.json().catch(() => null));
  if (list.length) regionCache.set(code, { at: Date.now(), list });
  return list;
}

export async function profileFrom(userData) {
  const role = resolveRole(userData);
  if (!role) throw new HttpError('Your MSMS role does not have access to the Admission Management System.', 403);
  const base = { username: String(userData.userName ?? '').trim(), role, region: null, district: null };
  if (!base.username) throw new HttpError('MSMS returned a login without a username.', 502);
  if (role === 'STATE') return base;
  const districts = await regionDistricts(userData.regionCode);
  if (role === 'REGION') {
    if (!districts.length) throw new HttpError('The districts of your region could not be found in MSMS.', 403);
    return { ...base, region: districts.map(d => d.name).join(',') };
  }
  const mine = districts.find(d => d.id === String(userData.districtId).trim());
  if (!mine) throw new HttpError('Your district could not be identified from MSMS.', 403);
  return { ...base, district: mine.name };
}

export async function msmsSignIn(username, password) {
  return profileFrom(await msmsLogin(username, password));
}
