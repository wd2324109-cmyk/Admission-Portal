import { useEffect, useRef, useState } from 'react';
import { api, setToken, savedUser, saveUser, peekLogoutReason, clearLogoutReason, setLogoutReason, downloadFile } from './api.js';
import { IdleGuard, OfflineBanner, PasswordMeter, passwordAcceptable, useCapsLock, CapsHint, IDLE_MINUTES } from './security.jsx';

const badge = v => <span className={`badge ${String(v || '').replace(/\W/g, '')}`}>{v || '—'}</span>;

const EyeIcon = ({ off }) => <svg viewBox="0 0 24 24" aria-hidden="true">{off
  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></>
  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}</svg>;


// ---- Sign in (passwords are reset by a super admin on the Users page)
function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' }), [err, setErr] = useState(peekLogoutReason), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [caps, capsOn] = useCapsLock();
  useEffect(() => { clearLogoutReason(); }, []);
  const go = async () => {
    if (busy) return;
    const username = f.username.trim();
    if (!username || !f.password) return setErr('Enter your username and password.');
    try { setBusy(true); setErr(''); const r = await api('/auth/login', { method: 'POST', body: { username, password: f.password } }); setToken(r.token); saveUser(r.user); setF({ username: '', password: '' }); onLogin(r.user); }
    catch (e) { setErr(e.message); setF(x => ({ ...x, password: '' })); } finally { setBusy(false); }
  };
  return <div className="login"><div className="panel">
    <div className="login-head"><img className="logo" src="/emblem.png" alt="Government of Tamil Nadu emblem" /><h2>Admission Portal</h2></div>
    <div className="field"><label htmlFor="login-user">Username</label><input id="login-user" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} autoFocus value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></div>
    <div className="field"><label htmlFor="login-pass">Password</label><div className="pw">
      <input id="login-pass" type={show ? 'text' : 'password'} autoComplete="current-password" maxLength={200} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} {...capsOn} onKeyDown={e => { capsOn.onKeyDown(e); if (e.key === 'Enter') go(); }} />
      <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}><EyeIcon off={show} /></button></div><CapsHint on={caps} /></div>
    <button className="pri" style={{ width: '100%' }} disabled={busy} onClick={go}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p className="login-notice">Forgot your password? Ask the super admin for a new one. Authorised users only. Sessions end after {IDLE_MINUTES} minutes of inactivity, and signing in on another device signs you out here.</p>
    <span className="err" role="alert">{err}</span></div></div>;
}

const IC = { users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  ok: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3', no: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M15 9l-6 6M9 9l6 6',
  seat: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z' };
IC.lock = 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4';
const Icon = ({ n }) => <svg viewBox="0 0 24 24"><path d={IC[n]} /></svg>;
const Stat = ({ icon, color, label, value, note }) => <div className="card stat"><div className={`chip ${color}`}><Icon n={icon} /></div>
  <div><span>{label}</span><b>{value.toLocaleString()}</b>{note && <small>{note}</small>}</div></div>;

const KEYS = [['notlisted', 'Not listed', '#9aa5bd'], ['waiting', 'Waiting', '#e8a317'], ['selected', 'Selected', '#3b5bdb'], ['joined', 'Joined', '#12a36b'], ['notwilling', 'Not Willing', '#e5484d'], ['notjoined', 'Not Joined', '#ff8f6b'], ['tc', 'TC', '#7c4dff']];
// The DMS (DISTRICT) works with six groups only: Pending, Selected, Joined, Not Willing, Not Joined, TC.
const DMS_KEYS = KEYS.filter(([k]) => k !== 'notlisted').map(([k, l, c]) => [k, k === 'waiting' ? 'Pending' : l, c]);
const keysFor = user => (user.role === 'DISTRICT' ? DMS_KEYS : KEYS);
const ICON = { notlisted: ['users', 'blue'], waiting: ['clock', 'amber'], selected: ['star', 'blue'], joined: ['ok', 'green'], notwilling: ['no', 'red'], notjoined: ['no', 'red'], tc: ['doc', 'violet'] };
const Legend = ({ keys }) => <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--mute)', marginBottom: 12, flexWrap: 'wrap' }}>{keys.map(([k, l, c]) =>
  <span key={k}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c, marginRight: 5 }} />{l}</span>)}</div>;

function Donut({ parts }) {
  const total = parts.reduce((a, p) => a + p.v, 0), R = 64, C = 2 * Math.PI * R; let off = 0;
  return <div className="donut"><div className="mid"><svg viewBox="0 0 170 170"><circle cx="85" cy="85" r={R} fill="none" stroke="#eef1f8" strokeWidth="18" />
    {parts.map(p => { const len = total ? (p.v / total) * C : 0, el = <circle key={p.l} cx="85" cy="85" r={R} fill="none" stroke={p.c} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />; off += len; return el; })}</svg>
    <div><b>{total}</b><span>Total</span></div></div>
    <div className="legend">{parts.map(p => <div key={p.l}><i style={{ background: p.c }} />{p.l}<b>{p.v}</b></div>)}</div></div>;
}

function ColumnChart({ rows, keys }) {
  const W = 520, H = 260, L = 40, B = 36, T = 16, nice = m => { const p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p) * p; };
  const top = nice(Math.max(1, ...rows.flatMap(r => keys.map(([k]) => r[k])))), ih = H - T - B, gw = (W - L) / Math.max(1, rows.length), bw = Math.min(34, (gw * 0.6) / keys.length), y = v => T + ih - (v / top) * ih;
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
    {[0, 1, 2, 3, 4].map(i => { const v = (top / 4) * i; return <g key={i}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#e8ecf4" /><text x={L - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#6b7690">{Math.round(v)}</text></g>; })}
    {rows.map((r, gi) => { const x0 = L + gi * gw + (gw - bw * keys.length - 8) / 2; return <g key={r.key}>
      {keys.map(([k, , c], i) => <g key={k}><rect x={x0 + i * (bw + 4)} y={y(r[k])} width={bw} height={T + ih - y(r[k])} rx="4" fill={c} />
        <text x={x0 + i * (bw + 4) + bw / 2} y={y(r[k]) - 5} fontSize="11" textAnchor="middle" fill="#1b2437">{r[k]}</text></g>)}
      <text x={L + gi * gw + gw / 2} y={H - 12} fontSize="12" textAnchor="middle" fill="#6b7690">Class {r.key}</text></g>; })}
  </svg>;
}

function Stacked({ title, rows, keys }) {
  const sum = r => keys.reduce((a, [k]) => a + (r[k] || 0), 0), list = rows.filter(r => sum(r) > 0).sort((a, b) => sum(b) - sum(a)).slice(0, 8), max = Math.max(1, ...list.map(sum));
  return <div className="panel"><h3>{title}</h3><Legend keys={keys} />{!list.length && <p style={{ color: 'var(--mute)' }}>No data yet.</p>}
    {list.map(r => <div className="bl" key={r.key}><div className="t"><b>{r.key}</b><span>{sum(r)}</span></div>
      <div className="bar">{keys.map(([k, l, c]) => <i key={k} title={`${l}: ${r[k]}`} style={{ width: `${(100 * r[k]) / max}%`, background: c }} />)}</div></div>)}</div>;
}


function Dashboard({ user }) {
  const [d, setD] = useState(null), [err, setErr] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p>Loading…</p>;
  const keys = keysFor(user), dms = user.role === 'DISTRICT', tot = k => d.byClass.reduce((a, r) => a + (r[k] || 0), 0);
  const split = k => d.byClass.map(r => `Class ${r.key}: ${r[k] || 0}`).join('  ·  ');
  return <>
    <div className="head"><h1>Dashboard</h1><span className="pill">{['SUPER_ADMIN', 'STATE'].includes(user.role) ? 'All districts' : user.region || user.district}</span></div>
    <div className="grid stats">{keys.map(([k, l]) => <Stat key={k} icon={ICON[k][0]} color={ICON[k][1]} label={l} value={tot(k)} note={split(k)} />)}</div>
    <div className="grid two">
      <div className="panel"><h3>Overall share</h3><Donut parts={keys.map(([k, l, c]) => ({ l, c, v: tot(k) }))} /></div>
      <div className="panel"><h3>Class comparison</h3><Legend keys={keys} /><ColumnChart rows={d.byClass} keys={keys} /></div>
    </div>
    <div className="grid two" style={{ marginTop: 16 }}><Stacked title="By district" rows={d.byDistrict} keys={keys} /><Stacked title="By community" rows={d.byCommunity} keys={keys} /></div>
    {!dms && <div className="panel" style={{ marginTop: 16 }}><h3>Seats</h3><p>{d.vacancy.seats} seats · {d.vacancy.joined} joined · {d.vacancy.open} open</p></div>}</>;
}

// ---- Students: the flowchart statuses (1A 1B 2A 6A / 3A 3B 7A 7B 8A 8B)
const CODE = { '1A': 'Waiting', '1B': 'Waiting (reconsidered)', '2A': 'Selected', '6A': 'Not Willing', '3A': 'Joined by HM', '3B': 'Joined by RC', '7A': 'Not Joined - Pending Approval', '7B': 'Not Joined - Approved', '8A': 'TC-Waiting', '8B': 'TC Issued' };
const GROUP_CLASS = { notlisted: 'PENDING', waiting: 'PENDING', selected: 'Selected', notwilling: 'NotAdmitted', joined: 'Admitted', notjoined: 'NotAdmitted', tc: 'TCIssued' };
const StatusBadge = ({ r }) => <span className={`badge ${GROUP_CLASS[r.group] || ''}`}>{r.statusCode ? `${r.statusCode} ${CODE[r.statusCode]}` : 'Not listed'}</span>;
const TABS = [['all', 'All'], ['notlisted', 'Not listed'], ['waiting', 'Waiting'], ['selected', 'Selected'], ['joined', 'Joined'], ['notwilling', 'Not Willing'], ['notjoined', 'Not Joined'], ['tc', 'TC']];
const ALL_CODES = ['', '1A', '1B', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B'];
// select_status = the status code (every one of the ten); admit_status = the description of that code.
const selectOf = r => r.selectStatus || '—', admitOf = r => r.admitStatus || '—';

function StudentModal({ cls, id, user, onClose, onChange }) {
  const [s, setS] = useState(null), [err, setErr] = useState(''), [remarks, setRemarks] = useState(''), [ov, setOv] = useState({ code: '', remarks: '' }), [busy, setBusy] = useState(false);
  const load = () => api(`/students/${cls}/${id}`).then(x => { setS(x); setOv(o => ({ ...o, code: x.state.code })); }).catch(e => setErr(e.message)); useEffect(() => { load(); }, [id]);
  if (!s) return err ? <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel"><p className="err">{err}</p></div></div> : null;
  const run = async fn => { try { setBusy(true); await fn(); setErr(''); setRemarks(''); await load(); onChange(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const go = a => run(() => api(`/students/${cls}/${id}/action`, { method: 'POST', body: { action: a.key, remarks } }));
  const needs = s.actions.some(a => a.needsRemarks);
  const rows = [['EMIS', s.emis], ['Class', s.classLevel], ['Select status', selectOf(s)], ['Admit status', admitOf(s)], ['Gender / Medium', `${s.gender} / ${s.medium}`], ['Community', s.community + (s.disabilityStatus ? ' (PWD)' : '')],
    ['Father / Mother', `${s.fatherName || '—'} / ${s.motherName || '—'}`], ['District / Block', `${s.district || '—'} / ${s.block || '—'}`], ['School', s.schoolname], ['Phone', s.phone || '—'], ['Address', [s.address, s.pincode].filter(Boolean).join(' - ') || '—'],
    ['Quarterly / Half-yearly', `${s.mark1 ?? '—'} / ${s.mark2 ?? '—'}`],
    ['Overall rank', s.orank ?? '—'], ['Total (highest of two)', s.total ?? '—'], ['NMMS / TRUST / Other marks', [s.nmss, s.trust, s.otherMarks].map(v => v ?? '—').join(' / ')],
    ['Allotted to', s.newSchoolName ? `${s.newSchoolName} (${s.newDistcName})` : '—'], ['Seat category', s.selectedCategory || '—'], ['Note', s.remark1 ? `${s.tag1}: ${s.remark1}` : '—']];
  return <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel" onClick={e => e.stopPropagation()}>
    <h3>{s.name} <StatusBadge r={s} /></h3>
    <table><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
    {s.actions.length > 0 && <><h4>Next step</h4>
      {needs && <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks" placeholder="Remarks / reason" value={remarks} onChange={e => setRemarks(e.target.value)} />}
      <div className="row2">{s.actions.map(a => <button key={a.key} className={/NOT_|REJECT/.test(a.key) ? 'bad' : 'pri'} disabled={busy} onClick={() => go(a)}>{a.label}</button>)}</div></>}
    {user.role === 'SUPER_ADMIN' && <><h4>Correction (super admin)</h4>
      <div className="row2"><select aria-label="Status" value={ov.code} onChange={e => setOv({ ...ov, code: e.target.value })}>{ALL_CODES.map(c => <option key={c} value={c}>{c ? `${c} ${CODE[c]}` : 'Not listed (clear)'}</option>)}</select></div>
      <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (required)" placeholder="Reason for the correction (required)" value={ov.remarks} onChange={e => setOv({ ...ov, remarks: e.target.value })} />
      <div className="row2"><button className="bad" disabled={busy} onClick={() => window.confirm('Force this status? The seat and the logs are updated.') && run(() => api(`/students/${cls}/${id}/override`, { method: 'POST', body: ov }))}>Apply correction</button></div></>}
    {err && <p className="err">{err}</p>}
    <h4>History</h4>{s.logs.map(l => <div key={l.id}><small>{new Date(l.at).toLocaleString()} · {l.by} · {l.before || 'start'} → {l.after || 'none'}{l.remarks ? ` · ${l.remarks}` : ''}</small></div>)}
    <div className="row2"><button onClick={onClose}>Close</button></div></div></div>;
}

const ClassTabs = ({ user, cls, setCls }) => <div className="tabs">{[9, 10].filter(c => user.role === 'SUPER_ADMIN' || (user.classes || []).includes(c)).map(c => <button key={c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)}>Class {c}</button>)}</div>;
const firstClass = user => ((user.role === 'SUPER_ADMIN' ? [9, 10] : user.classes || [])[0]) || 9;

function StudentDetails({ user }) {
  const [cls, setCls] = useState(firstClass(user)), [tab, setTab] = useState(user.role === 'DISTRICT' ? 'waiting' : 'notlisted'), [data, setData] = useState({ rows: [], pages: 1 });
  const [search, setSearch] = useState(''), [q, setQ] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [open, setOpen] = useState(null), [reload, setReload] = useState(0), [listErr, setListErr] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [cls, tab, q, status]);
  useEffect(() => {
    let stale = false;
    api(`/students?class=${cls}&view=${tab}&status=${status}&search=${encodeURIComponent(q)}&page=${page}`).then(d => { if (!stale) { setData(d); setListErr(''); } }).catch(e => !stale && setListErr(e.message));
    return () => { stale = true; };
  }, [cls, tab, q, status, page, reload]);
  // DMS: from the Pending or Selected tab a student is marked Joined in one click; Not joined opens the record because a reason is required.
  const markJoined = async r => { if (!window.confirm(`Mark ${r.name} as joined?`)) return; try { await api(`/students/${cls}/${r.id}/action`, { method: 'POST', body: { action: 'JOINED_HM', remarks: '' } }); setReload(n => n + 1); } catch (e) { setListErr(e.message); } };
  return <>
    <div className="head"><h1>Student Details</h1></div>
    <ClassTabs user={user} cls={cls} setCls={setCls} />
    <div className="tabs">{(user.role === 'DISTRICT' ? DMS_KEYS.map(([k, l]) => [k, l]) : TABS).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    <div className="panel">
      <div className="row2"><input aria-label="Search name / EMIS" placeholder="Search name / EMIS" value={search} onChange={e => setSearch(e.target.value)} />
        {user.role !== 'DISTRICT' && <select aria-label="Select status" value={status} onChange={e => setStatus(e.target.value)}><option value="">Every status</option>{ALL_CODES.filter(Boolean).map(c => <option key={c} value={c}>{c} · {CODE[c]}</option>)}</select>}
        <button onClick={() => downloadFile(`/export/master?class=${cls}`).catch(e => setListErr(e.message))}>Download Excel</button></div>
      {listErr && <p className="err">{listErr}</p>}
      <table><thead><tr><th>EMIS</th><th>Name</th><th>District</th><th>Comm.</th><th>Rank</th><th>Seat</th><th>Select status</th><th>Admit status</th><th>Next step</th></tr></thead>
        <tbody>{data.rows.map(r => <tr className="row" key={r.id} onClick={() => setOpen(r.id)}>
          <td>{r.emis}</td><td>{r.name}</td><td>{r.district}</td><td>{r.community}</td><td>{r.orank ?? '—'}</td><td>{r.selectedCategory || '—'}</td><td><b>{selectOf(r)}</b></td><td>{admitOf(r)}</td><td>{user.role === 'DISTRICT' && ['1A', '2A'].includes(r.statusCode) ? <div className="row2"><button className="pri" onClick={e => { e.stopPropagation(); markJoined(r); }}>Joined</button><button className="bad" onClick={e => { e.stopPropagation(); setOpen(r.id); }}>Not joined</button></div>
          : r.actions.length ? <small>{r.actions.map(a => a.label.split(' - ')[0]).join(' / ')}</small> : ''}</td></tr>)}</tbody></table>
      {!data.rows.length && !listErr && <p style={{ color: 'var(--mute)' }}>No students in this view.</p>}
      {data.pages > 1 && <div className="row2"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>Page {page} / {data.pages}<button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
    {open && <StudentModal cls={cls} id={open} user={user} onClose={() => setOpen(null)} onChange={() => setReload(n => n + 1)} />}</>;
}

// ---- Vacancies: per seat group, and seat by seat
const SEAT_TAG = { RESERVED: ['Reserved', 'RESERVED'], JOINED: ['Joined', 'Admitted'], VACANT: ['Vacant', 'VACANT'] };
function SeatList({ user }) {
  const [cls, setCls] = useState(firstClass(user)), [mode, setMode] = useState('groups'), [tab, setTab] = useState(''), [search, setSearch] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const [d, setD] = useState({ rows: [], pages: 1, counts: {} }), [cells, setCells] = useState([]), [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [cls, tab, q, mode]);
  useEffect(() => {
    let stale = false;
    if (mode === 'groups') api(`/vacancies?class=${cls}`).then(r => { if (!stale) { setCells(r); setErr(''); } }).catch(e => !stale && setErr(e.message));
    else api(`/seats?class=${cls}&status=${tab}&search=${encodeURIComponent(q)}&page=${page}`).then(r => { if (!stale) { setD(r); setErr(''); } }).catch(e => !stale && setErr(e.message));
    return () => { stale = true; };
  }, [cls, mode, tab, q, page]);
  const c = d.counts || {};
  return <>
    <div className="head"><h1>Vacancies</h1><button onClick={() => downloadFile(`/export/vacancies?class=${cls}`).catch(e => setErr(e.message))}>Download Excel</button></div>
    <ClassTabs user={user} cls={cls} setCls={setCls} />
    <div className="tabs">{[['groups', 'By seat group'], ['seats', 'Seat by seat']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
    {mode === 'seats' && <div className="tabs">{[['', 'All'], ['RESERVED', 'Reserved'], ['JOINED', 'Joined'], ['VACANT', 'Vacant']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} ({k ? c[k] || 0 : (c.RESERVED || 0) + (c.JOINED || 0) + (c.VACANT || 0)})</button>)}</div>}
    <div className="panel">{err && <p className="err">{err}</p>}
      {mode === 'groups' ? <><table><thead><tr><th>District</th><th>School</th><th>Gender</th><th>Medium</th><th>Community</th><th>Seats</th><th>Joined</th><th>Held (listed / selected)</th><th>Open balance</th></tr></thead>
        <tbody>{cells.map((x, i) => <tr key={i}><td>{x.district}</td><td>{x.school || x.udiseCode || '—'}</td><td>{x.gender}</td><td>{x.medium}</td><td>{x.community}</td><td>{x.seats}</td><td>{x.joined}</td><td>{x.held}</td><td><b>{x.open}</b></td></tr>)}</tbody></table>
        {!cells.length && !err && <p style={{ color: 'var(--mute)' }}>No vacancies yet.</p>}</>
      : <><div className="row2"><input aria-label="Search student" placeholder="Search student name / EMIS" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <table><thead><tr><th>#</th><th>District</th><th>Gender</th><th>Medium</th><th>Community</th><th>Status</th><th>Student</th></tr></thead>
          <tbody>{d.rows.map((r, i) => <tr key={i}><td>{r.seatNo}</td><td>{r.district}</td><td>{r.gender}</td><td>{r.medium}</td><td>{r.community}</td><td><span className={`badge ${SEAT_TAG[r.status][1]}`}>{SEAT_TAG[r.status][0]}</span></td>
            <td>{r.who ? <><b>{r.who.name}</b> · EMIS {r.who.emis}</> : r.remarks || '—'}</td></tr>)}</tbody></table>
        {d.pages > 1 && <div className="row2"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>Page {page} / {d.pages}<button disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button></div>}</>}
    </div></>;
}

// ---- TC requests: DMS asks, the Regional Coordinator approves, then the State Regional Coordinator
IC.doc = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8';
const TC_STAGE = { REGION: ['Waiting for the Regional Coordinator', 'PENDING'], STATE: ['Waiting for the State Regional Coordinator', 'RCAPPROVED'], DONE: ['TC Issued (8B)', 'Admitted'] };
function TcRequests({ user }) {
  const [rows, setRows] = useState([]), [err, setErr] = useState(''), [n, setN] = useState(0), [open, setOpen] = useState(null), [cls, setCls] = useState(firstClass(user));
  useEffect(() => { api('/tc').then(setRows).catch(e => setErr(e.message)); }, [n]);
  const mine = rows.filter(r => r.classLevel === cls);
  return <>
    <div className="head"><h1>TC Requests</h1></div><ClassTabs user={user} cls={cls} setCls={setCls} />
    <p><small>A TC is requested from a student's record (Student Details → open the student → "Request TC"). It is then approved by the Regional Coordinator and by the State Regional Coordinator; the seat is released only when the TC is issued.</small></p>
    <div className="panel">{err && <p className="err">{err}</p>}
      <table><thead><tr><th>EMIS</th><th>Name</th><th>School</th><th>Reason</th><th>Stage</th><th></th></tr></thead>
        <tbody>{mine.map(r => <tr className="row" key={r.id} onClick={() => setOpen(r.id)}><td>{r.emis}</td><td>{r.name}</td><td>{r.newSchoolName}</td><td>{r.reason || '—'}</td>
          <td><span className={`badge ${TC_STAGE[r.tcStage][1]}`}>{TC_STAGE[r.tcStage][0]}</span></td><td>{r.actions.length ? <b>Your decision</b> : ''}</td></tr>)}</tbody></table>
      {!mine.length && !err && <p style={{ color: 'var(--mute)' }}>No TC requests.</p>}</div>
    {open && <StudentModal cls={cls} id={open} user={user} onClose={() => setOpen(null)} onChange={() => setN(x => x + 1)} />}</>;
}

// ---- Import: 9th_master_sheet, 9th_vacancy_sheet, 10th_master_sheet, 10th_vacancy_sheet (and the State Enrollment Team's rank / list buttons)
const b64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
function Uploader({ title, hint, path, cls, canReplace, modes }) {
  const [file, setFile] = useState(null), [replace, setReplace] = useState(false), [mode, setMode] = useState('replace'), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [err, setErr] = useState('');
  const go = async () => {
    try {
      if (!file) throw new Error('Choose an Excel (.xlsx) file first');
      if (replace && !window.confirm(`This deletes ALL existing Class ${cls} students before importing. Continue?`)) return;
      setBusy(true); setErr(''); setRes(null);
      setRes(await api(path, { method: 'POST', body: { classLevel: cls, replace, mode, fileData: await b64(file) } }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <div className="panel"><h3>{title}</h3><p><small>{hint}</small></p>
    <div className="row2"><input type="file" accept=".xlsx,.xls" onChange={e => { setFile(e.target.files[0]); setRes(null); }} /></div>
    {canReplace && <label className="row2"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} /> Replace existing Class {cls} students (start fresh)</label>}
    {modes && <div className="row2"><select aria-label="Mode" value={mode} onChange={e => setMode(e.target.value)}><option value="replace">Replace this class's vacancies</option><option value="append">Add seats (a later round)</option></select></div>}
    <div className="row2"><button className="pri" disabled={busy} onClick={go}>{busy ? 'Importing…' : `Import for Class ${cls}`}</button></div>
    {err && <p className="err">{err}</p>}
    {res && <div><p><b>{res.imported}</b> {res.seats ? `rows imported as ${res.seats} seats` : 'imported'}{res.skippedExisting ? <>, {res.skippedExisting} skipped (already exist)</> : ''}{res.rejectedCount ? <>, <span className="err">{res.rejectedCount} rejected</span></> : ''}.</p>
      {res.rejected?.length > 0 && <table><thead><tr><th>Excel row</th><th>Problem</th></tr></thead><tbody>{res.rejected.map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.reason}</td></tr>)}</tbody></table>}
      {res.newUsers?.length > 0 && <><h4>New logins created</h4><p className="err"><small>Copy these now. Passwords are shown only once.</small></p>
        <table><thead><tr><th>Role</th><th>For</th><th>Username</th><th>Password</th></tr></thead><tbody>{res.newUsers.map(u => <tr key={u.username}><td>{u.role}</td><td>{u.scope}</td><td>{u.username}</td><td><code>{u.password}</code></td></tr>)}</tbody></table></>}</div>}
  </div>;
}
function ListPanel({ cls, user }) {
  const [busy, setBusy] = useState(false), [res, setRes] = useState(null), [err, setErr] = useState('');
  const run = async (path, body, label) => { try { setBusy(true); setErr(''); setRes(null); const r = await api(path, { method: 'POST', body: { classLevel: cls, ...body } }); setRes({ label, r }); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <div className="panel"><h3>State Enrollment Team</h3>
    <p><small>1. Generate the overall rank (before any list). 2. Generate the student list: it fills the open balance of every seat group with the best-ranked eligible students and marks them Waiting (1A). Repeat after the DMS has finished a list: seats freed by Not Willing (6A), Not Joined - Approved (7B) and TC Issued (8B) are filled again, and students in Waiting (1B) are considered again.</small></p>
    <div className="row2"><button disabled={busy} onClick={() => window.confirm('Generate the overall rank for every Class ' + cls + ' student?') && run('/rank/generate', {}, 'rank')}>Generate overall rank</button>
      <button disabled={busy} onClick={() => run('/lists/generate', { preview: true }, 'preview')}>Preview next list</button>
      <button className="pri" disabled={busy} onClick={() => window.confirm('Generate the next student list for Class ' + cls + ' and send it to the DMS?') && run('/lists/generate', {}, 'list')}>Generate student list</button></div>
    {err && <p className="err">{err}</p>}
    {res?.label === 'rank' && <p><b>{res.r.ranked}</b> students ranked.</p>}
    {res && res.label !== 'rank' && <><p>{res.label === 'preview' ? 'Preview: ' : `List ${res.r.listNumber ?? '—'}: `}<b>{res.r.listed}</b> students {res.label === 'preview' ? 'would be' : 'were'} listed; open seats {res.r.openSeats}, shortfall {res.r.shortfall}.</p>
      {res.r.cells.length > 0 && <table><thead><tr><th>District</th><th>School</th><th>Gender</th><th>Medium</th><th>Community</th><th>Open</th><th>Listed</th><th>Shortfall</th></tr></thead>
        <tbody>{res.r.cells.map((c, i) => <tr key={i}><td>{c.district}</td><td>{c.school}</td><td>{c.gender}</td><td>{c.medium}</td><td>{c.community}</td><td>{c.open}</td><td>{c.listed}</td><td>{c.shortfall}</td></tr>)}</tbody></table>}</>}
  </div>;
}
function ImportData({ user }) {
  const [cls, setCls] = useState(9), admin = user.role === 'SUPER_ADMIN', th = `${cls}th`;
  return <>
    <div className="head"><h1>{admin ? 'Import Data & Lists' : 'Furnish Vacancies'}</h1></div>
    <div className="tabs">{[9, 10].map(c => <button key={c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)}>Class {c}</button>)}</div>
    <div className="grid two">
      {admin && <Uploader key={'s' + cls} title={`${th}_master_sheet`} cls={cls} path="/import/students" canReplace
        hint="Columns (as in the database document): district, block, Udise, school_type, Schoolname, Emis, Name, Dob, Gender, community, medium, Disability_status, Disability_desc, Father_name, Mother_name, Phone, address, pincode, mark1-quertly, mark2-half, Total-highest of two, pass, nmss, Trust (Trust is the last column). The status columns are filled by the portal: select_status gets the status code and admit_status its description. Emis is a whole number up to 2,147,483,647." />}
      <Uploader key={'v' + cls} title={admin ? `${th}_vacancy_sheet` : `Your district ${th}_vacancy_sheet`} cls={cls} path="/import/vacancies" modes
        hint="Columns: New_district, New_udise_type, New_udise_code, New_school_name, Group_code, Group_desc, gender, medium, community (GT-PWD, GT, BC, BCM, MBC, SC, SCA, ST), vacancies, admitted. One sheet row becomes one seat row per vacancy." />
      {admin && <ListPanel cls={cls} user={user} />}
    </div></>;
}

// ---- History: the two log tables of the database document
IC.log = 'M4 6h16M4 12h16M4 18h10';
const ts = d => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
function Logs() {
  const [kind, setKind] = useState('students'), [cls, setCls] = useState(''), [q, setQ] = useState(''), [rows, setRows] = useState([]), [err, setErr] = useState('');
  useEffect(() => { let stale = false; api(`/logs/${kind}?class=${cls}&q=${encodeURIComponent(q)}`).then(r => !stale && (setRows(r), setErr(''))).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [kind, cls, q]);
  return <>
    <div className="head"><h1>Change History</h1></div>
    <div className="tabs">{[['students', 'Student_LOG'], ['vacancies', 'VACANCY_logs']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
    <div className="row2"><input aria-label="Search" placeholder={kind === 'students' ? 'Search name / EMIS / user' : 'Search district / EMIS / user'} value={q} onChange={e => setQ(e.target.value)} />
      <select value={cls} onChange={e => setCls(e.target.value)}><option value="">All classes</option>{[9, 10].map(c => <option key={c}>{c}</option>)}</select></div>
    {err && <p className="err">{err}</p>}
    <div className="panel">{kind === 'students'
      ? <table><thead><tr><th>#</th><th>Time</th><th>User</th><th>Class</th><th>EMIS</th><th>Name</th><th>Change</th><th>Seat in</th><th>Note</th></tr></thead>
        <tbody>{rows.map(l => <tr key={l.id}><td>{l.id}</td><td>{ts(l.updatedAt)}</td><td>{l.updatedBy}</td><td>{l.class}</td><td>{l.emis}</td><td>{l.name}</td><td>{l.updateStatusBefore || 'start'} → {l.updateStatusAfter || 'none'}</td><td>{l.newSchoolName || '—'}</td><td>{l.remark1 || '—'}</td></tr>)}</tbody></table>
      : <table><thead><tr><th>#</th><th>Time</th><th>User</th><th>Class</th><th>District</th><th>School</th><th>Seat group</th><th>EMIS</th><th>Change</th></tr></thead>
        <tbody>{rows.map(l => <tr key={l.id}><td>{l.id}</td><td>{ts(l.updatedAt)}</td><td>{l.updatedBy}</td><td>{l.classLevel}</td><td>{l.newDistrict}</td><td>{l.newSchoolName || '—'}</td><td>{l.gender} / {l.medium} / {l.community}</td><td>{l.vacancyRefNo ?? '—'}</td><td>{l.updateStatusBefore} → {l.updateStatusAfter}</td></tr>)}</tbody></table>}
      {!rows.length && !err && <p style={{ color: 'var(--mute)' }}>No entries.</p>}</div></>;
}

// ---- Users: create, new password, class access (the users and access tables)
function UsersPage({ me }) {
  const [rows, setRows] = useState([]), [err, setErr] = useState(''), [n, setN] = useState(0), [shown, setShown] = useState(null), [f, setF] = useState({ username: '', role: 'DISTRICT', district: '', region: '', classes: [9, 10] });
  useEffect(() => { let stale = false; api('/users').then(r => !stale && (setRows(r), setErr(''))).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [n]);
  const run = async fn => { try { setErr(''); await fn(); setN(x => x + 1); } catch (e) { setErr(e.message); } };
  const toggle = (arr, c) => (arr.includes(c) ? arr.filter(x => x !== c) : [...arr, c].sort());
  return <>
    <div className="head"><h1>Users &amp; Access</h1></div>
    {err && <p className="err" role="alert">{err}</p>}
    {shown && <div className="panel"><p className="err"><b>Copy now, shown only once:</b> {shown.username} / <code>{shown.password}</code></p><button onClick={() => setShown(null)}>Done</button></div>}
    <div className="panel"><table><thead><tr><th>User</th><th>Role</th><th>District / region</th><th>Signed in</th><th>Classes</th><th></th></tr></thead>
      <tbody>{rows.map(u => <tr key={u.id}><td>{u.username}</td><td>{u.role === 'STATE' ? 'STATE REGIONAL COORDINATOR' : u.role === 'REGION' ? 'REGIONAL COORDINATOR' : u.role === 'DISTRICT' ? 'DMS (DISTRICT)' : 'SE TEAM (SUPER ADMIN)'}</td><td>{u.district || u.region || '—'}</td><td>{u.signedIn ? 'Yes' : '—'}</td>
        <td>{u.role === 'SUPER_ADMIN' ? 'All' : [9, 10].map(c => <label key={c} style={{ marginRight: 8 }}><input type="checkbox" checked={u.classes.includes(c)} onChange={() => run(() => api(`/users/${u.id}/access`, { method: 'PUT', body: { classes: toggle(u.classes, c) } }))} /> {c}</label>)}</td>
        <td>{u.id !== me.id && <button onClick={() => window.confirm(`Give ${u.username} a new password? They are signed out.`) && run(async () => setShown(await api(`/users/${u.id}/reset-password`, { method: 'POST' })))}>New password</button>}</td></tr>)}</tbody></table></div>
    <div className="panel"><h3>Add a user</h3>
      <div className="row2"><input aria-label="Username" placeholder="Username" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
        <select aria-label="Role" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="DISTRICT">DMS (district)</option><option value="REGION">Regional Coordinator</option><option value="STATE">State Regional Coordinator</option><option value="SUPER_ADMIN">SE Team (super admin)</option></select>
        {f.role === 'DISTRICT' && <input aria-label="District" placeholder="District" value={f.district} onChange={e => setF({ ...f, district: e.target.value })} />}
        {f.role === 'REGION' && <input aria-label="Region" placeholder="District(s), comma separated" value={f.region} onChange={e => setF({ ...f, region: e.target.value })} />}</div>
      <div className="row2">{[9, 10].map(c => <label key={c}><input type="checkbox" checked={f.classes.includes(c)} onChange={() => setF({ ...f, classes: toggle(f.classes, c) })} /> Class {c}</label>)}
        <button className="pri" onClick={() => run(async () => { setShown(await api('/users', { method: 'POST', body: f })); setF({ ...f, username: '' }); })}>Create</button></div></div></>;
}

function ChangePassword({ onClose, username }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', again: '' }), [err, setErr] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = async () => {
    if (f.newPassword !== f.again) return setErr('The new passwords do not match');
    if (!passwordAcceptable(f.newPassword, username)) return setErr('The new password does not meet the requirements listed below.');
    try { setBusy(true); const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } }); if (r.token) setToken(r.token); setErr(''); setDone(true); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
    <h3>Change password</h3>
    {done ? <><p>Password changed.</p><div className="row2"><button className="pri" onClick={onClose}>Close</button></div></> : <>
      <div className="field"><label htmlFor="cp-cur">Current password</label><input id="cp-cur" type="password" autoComplete="current-password" autoFocus value={f.currentPassword} onChange={set('currentPassword')} /></div>
      <div className="field"><label htmlFor="cp-new">New password (at least 10 characters)</label><input id="cp-new" type="password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} maxLength={200} /><PasswordMeter value={f.newPassword} username={username} /></div>
      <div className="field"><label htmlFor="cp-again">Repeat new password</label><input id="cp-again" type="password" autoComplete="new-password" value={f.again} onChange={set('again')} onKeyDown={e => e.key === 'Enter' && submit()} /></div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row2"><button className="pri" disabled={busy || !f.currentPassword || !passwordAcceptable(f.newPassword, username) || f.newPassword !== f.again} onClick={submit}>{busy ? 'Saving…' : 'Change password'}</button><button onClick={onClose}>Cancel</button></div></>}
  </div></div>;
}


export default function App() {
  const [user, setUser] = useState(savedUser), [page, setPage] = useState('dash'), [pw, setPw] = useState(false), [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { const h = e => { if (e.key === 'Escape') { document.querySelector('.modal')?.click(); setMobileOpen(false); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const pageNames = { dash: 'Dashboard', students: 'Student Details', seats: 'Vacancy Management', tc: 'TC Requests', import: 'Import Data & Lists', logs: 'Change History', users: 'Users & Access' };
  useEffect(() => { document.title = `${user ? (pageNames[page] || 'Admission Portal') : 'Sign in'} · School Admissions Portal`; }, [page, user]);
  useEffect(() => {
    if (!user) return;
    const vis = () => document.visibilityState === 'visible' && api('/auth/session').catch(() => {});
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [user]);
  if (!user) return <Login onLogin={setUser} />;
  const admin = user.role === 'SUPER_ADMIN', dms = user.role === 'DISTRICT', canVac = admin;       // the DMS sees Dashboard, Student Details and TC Requests only
  const Nav = ({ k, icon, label }) => <button className={`nav ${page === k ? 'on' : ''}`} aria-current={page === k ? 'page' : undefined} onClick={() => { setPage(k); setMobileOpen(false); }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={IC[icon]} /></svg><span>{label}</span></button>;
  const logout = reason => { if (typeof reason === 'string' && reason) setLogoutReason(reason); api('/auth/logout', { method: 'POST' }).catch(() => {}).finally(() => { setToken(null); setUser(null); if (typeof reason === 'string' && reason) window.location.reload(); }); };
  const roleName = { SUPER_ADMIN: 'SE TEAM (SUPER ADMIN)', STATE: 'STATE REGIONAL COORDINATOR', REGION: 'REGIONAL COORDINATOR', DISTRICT: 'DMS (DISTRICT)' }[user.role];
  const body = page === 'dash' ? <Dashboard user={user} /> : page === 'students' ? <StudentDetails user={user} /> : page === 'seats' && !dms ? <SeatList user={user} /> : page === 'tc' ? <TcRequests user={user} />
    : page === 'import' && canVac ? <ImportData user={user} /> : page === 'logs' && admin ? <Logs /> : page === 'users' && admin ? <UsersPage me={user} /> : <Dashboard user={user} />;
  return <div className={`shell ${mobileOpen ? 'menu-open' : ''}`}>
    <button className="side-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
    <aside className="side" aria-label="Main navigation">
      <div className="brand"><img src="/emblem.png" alt="Government of Tamil Nadu emblem" /><div><strong>Admissions Portal</strong><small>Government of Tamil Nadu</small></div></div>
      <div className="nav-caption">WORKSPACE</div>
      <Nav k="dash" icon="seat" label="Dashboard" /><Nav k="students" icon="users" label="Student Details" />
      <div className="nav-caption">ADMISSION PROCESS</div>
      {!dms && <Nav k="seats" icon="seat" label="Vacancy Management" />}<Nav k="tc" icon="doc" label="TC Requests" />
      {canVac && <Nav k="import" icon="up" label="Import Data & Lists" />}
      {admin && <><div className="nav-caption">ADMINISTRATION</div><Nav k="logs" icon="log" label="Change History" /><Nav k="users" icon="users" label="Users & Access" /></>}
      <div className="side-spacer" />
      <div className="side-security"><span className="security-dot" /> Secure administrative workspace</div>
      <div className="me"><div className="av">{(user.username || 'U')[0]}</div><div className="me-copy"><strong>{user.username}</strong><small>{roleName}</small></div></div>
      <div className="acct"><button className="acct-btn" onClick={() => setPw(true)}>Change password</button><button className="acct-btn out" onClick={() => logout()}>Sign out</button></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button className="menu-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span></span><span></span><span></span></button><div><div className="eyebrow">ADMISSION MANAGEMENT SYSTEM</div><div className="page-title">{pageNames[page]}</div></div></div>
        <div className="topbar-right"><div className="scope-chip"><span className="scope-dot"></span>{['SUPER_ADMIN', 'STATE'].includes(user.role) ? 'All districts' : user.region || user.district}</div></div>
      </header>
      <OfflineBanner /><div className="page-content">{body}</div>
      <footer className="app-footer"><span>Government of Tamil Nadu · Admission Management System</span><span>Authorised access only</span></footer>
    </main>
    {pw && <ChangePassword username={user.username} onClose={() => setPw(false)} />}
    <IdleGuard onExpire={logout} />
  </div>;
}
