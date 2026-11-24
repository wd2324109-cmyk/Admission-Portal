import { HttpError } from './http.js';

const LOGIN_URL = process.env.MSMS_LOGIN_URL || 'https://qe5r30ot7h.execute-api.ap-south-1.amazonaws.com/api/login/msmslogin';
const REGION_URL = process.env.MSMS_REGION_URL || 'https://qkpovsx8ol.execute-api.ap-south-1.amazonaws.com/api/masters/school-region-details';
const TIMEOUT_MS = +process.env.MSMS_TIMEOUT_MS || 10000;
const REGION_TTL_MS = 10 * 60 * 1000;

export const norm = v => String(v ?? '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
const roleSet = (v, d) => new Set(String(v ?? d).split(',').map(norm).filter(Boolean));
const RC_ROLES = roleSet(process.env.MSMS_RC_ROLES, 'RC');
const STATE_ROLES = roleSet(process.env.MSMS_STATE_ROLES, 'STATE CO ORDINATOR,STATE COORDINATOR,STATE LEAD,STATE LEADS');
const SUPER_DESIGNATIONS = roleSet(process.env.MSMS_SUPERADMIN_DESIGNATIONS, 'STATE LEAD ENROLLMENT');
const HM_ROLES = roleSet(process.env.MSMS_HM_ROLES, 'HM');

export const decodeToken = token => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).userData || null; } catch { return null; }
};

export function resolveRole(d) {
  if (SUPER_DESIGNATIONS.has(norm(d?.designation))) return 'SUPER_ADMIN';
  const tags = [norm(d?.userRole), norm(d?.staffType)];
  if (tags.some(t => RC_ROLES.has(t))) return 'REGION';
  if (tags.some(t => STATE_ROLES.has(t))) return 'STATE';
  if (tags.some(t => HM_ROLES.has(t))) return 'DISTRICT';
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
  const { token: _t, ...reply } = data;
  return { ...userData, loginReply: reply };
}

// The person's name from the MSMS login: the response body first, then the token. MSMS_NAME_FIELD (comma separated) overrides the guesses.
const NAME_FIELDS = String(process.env.MSMS_NAME_FIELD || 'name,fullName,full_name,userFullName,staffName,displayName,userDisplayName,employeeName,hmName').split(',').map(x => x.trim()).filter(Boolean);
const NAME_MAX = 120;
export const nameFrom = d => {
  const reply = d?.loginReply || {};
  for (const src of [reply, reply.data, reply.user, reply.userData, d]) {
    if (!src || typeof src !== 'object') continue;
    for (const k of NAME_FIELDS) {
      const v = src[k];
      if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
    }
  }
  return null;
};

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
    found.set(id === null ? nameOf(name) : String(id).trim(), nameOf(name));
  }
  return [...found].map(([id, name]) => ({ id, name }));
};

const ALIASES = new Map(String(process.env.MSMS_DISTRICT_ALIASES || '').split(';').map(x => x.split('=').map(norm)).filter(x => x.length === 2 && x[0] && x[1]));
const nameOf = v => { const n = norm(v); return ALIASES.get(n) || n; };
const phoneOf = v => String(v ?? '').replace(/\D/g, '').slice(-10);

const regionCache = new Map();
export async function regionRows(regionCode) {
  const code = String(regionCode ?? '').trim();
  if (!code) return [];
  const hit = regionCache.get(code);
  if (hit && Date.now() - hit.at < REGION_TTL_MS) return hit.rows;
  const res = await call(`${REGION_URL}?regionCode=${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new HttpError('MSMS could not give the districts of your region right now. Please try again in a moment.', 502);
  const rows = rowsOf(await res.json().catch(() => null)) || [];
  if (rows.length) regionCache.set(code, { at: Date.now(), rows });
  return rows;
}

export const regionDistricts = async regionCode => districtsFrom(await regionRows(regionCode));

export function districtsOfHm(rows, phone) {
  const mine = rows.filter(r => phoneOf(r.hmPhone) && phoneOf(r.hmPhone) === phoneOf(phone));
  return districtsFrom(mine);
}

export async function profileFrom(userData) {
  const role = resolveRole(userData);
  if (!role) throw new HttpError('Invalid Credentials', 403);
  const base = { username: String(userData.userName ?? '').trim(), name: nameFrom(userData), role, region: null, district: null };
  if (!base.username) throw new HttpError('MSMS returned a login without a username.', 502);
  if (role === 'STATE' || role === 'SUPER_ADMIN') return base;
  const rows = await regionRows(userData.regionCode), districts = districtsFrom(rows);
  if (role === 'REGION') {
    if (!districts.length) throw new HttpError('The districts of your region could not be found in MSMS.', 403);
    return { ...base, region: districts.map(d => d.name).join(',') };
  }
  const byId = districts.filter(d => d.id === String(userData.districtId ?? '').trim());
  const mine = byId.length ? byId : districtsOfHm(rows, base.username);
  if (!mine.length) throw new HttpError('Your district could not be identified from MSMS.', 403);
  return { ...base, district: [...new Set(mine.map(d => d.name))].join(',') };
}

export async function msmsSignIn(username, password) {
  return profileFrom(await msmsLogin(username, password));
}
