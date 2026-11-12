import { useEffect, useRef, useState } from 'react';
import { api, setToken, savedUser, saveUser, peekLogoutReason, clearLogoutReason, setLogoutReason, fileBlob, openFile, downloadFile } from './api.js';
import { IdleGuard, OfflineBanner, PasswordMeter, passwordAcceptable, useCapsLock, CapsHint, IDLE_MINUTES } from './security.jsx';

const badge = v => <span className={`badge ${String(v || '').replace(/\W/g, '')}`}>{v || '—'}</span>;

const EyeIcon = ({ off }) => <svg viewBox="0 0 24 24" aria-hidden="true">{off
  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></>
  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}</svg>;

function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' }), [err, setErr] = useState(peekLogoutReason), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [caps, capsOn] = useCapsLock();
  const [fu, setFu] = useState(''), [sent, setSent] = useState(''), [c, setC] = useState({ username: '', code: '', newPassword: '', again: '' });
  const [canReset, setCanReset] = useState(false), [mode, setMode] = useState('login'), [r, setR] = useState({ username: '', newPassword: '', again: '' }), [msg, setMsg] = useState('');
  useEffect(() => { clearLogoutReason(); api('/auth/test-reset-status').then(d => setCanReset(!!d.enabled)).catch(() => {}); }, []);
  const go = async () => {
    if (busy) return;
    const username = f.username.trim();
    if (!username || !f.password) return setErr('Enter your username and password.');
    try { setBusy(true); setErr(''); const r = await api('/auth/login', { method: 'POST', body: { username, password: f.password } }); setToken(r.token); saveUser(r.user); setF({ username: '', password: '' }); onLogin(r.user); }
    catch (e) { setErr(e.message); setF(x => ({ ...x, password: '' })); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (busy) return;
    if (r.newPassword !== r.again) return setErr('The new passwords do not match');
    try { setBusy(true); await api('/auth/test-reset-password', { method: 'POST', body: { username: r.username, newPassword: r.newPassword } });
      setErr(''); setMsg('Password reset. You can sign in now.'); setF({ username: r.username, password: '' }); setR({ username: '', newPassword: '', again: '' }); setMode('login'); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const askReset = async () => {
    if (busy) return;
    const username = fu.trim(); if (!username) return setErr('Enter your username.');
    try { setBusy(true); setErr(''); const d = await api('/auth/password-reset/request', { method: 'POST', body: { username } }); setSent(d.message || 'Request sent.'); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const submitCode = async () => {
    if (busy) return;
    const username = c.username.trim();
    if (!username || !c.code.trim()) return setErr('Enter your username and the reset code.');
    if (c.newPassword !== c.again) return setErr('The new passwords do not match');
    if (!passwordAcceptable(c.newPassword, username)) return setErr('The new password does not meet the requirements listed below.');
    try { setBusy(true); setErr(''); await api('/auth/password-reset/complete', { method: 'POST', body: { username, code: c.code.trim(), newPassword: c.newPassword } });
      setMsg('Your password has been changed. You can sign in now.'); setF({ username, password: '' }); setC({ username: '', code: '', newPassword: '', again: '' }); setMode('login'); }
    catch (e) { setErr(e.message); setC(x => ({ ...x, newPassword: '', again: '' })); } finally { setBusy(false); }
  };
  const go2 = (m) => { setMode(m); setErr(''); setMsg(''); setSent(''); };
  const head = <div className="login-head"><img className="logo" src="/emblem.png" alt="Government of Tamil Nadu emblem" /><h2>Admission Portal</h2></div>;
  if (mode === 'forgot') return <div className="login"><div className="panel">{head}
    <h3 className="login-sub">Forgot password</h3>
    {sent ? <><p role="status">{sent}</p>
      <p className="login-notice" style={{ border: 0, margin: '0 0 12px', padding: 0 }}>When it is approved, the super admin will give you a one-time code (for example by phone). Then choose “I have a reset code” to set a new password.</p>
      <button className="pri" style={{ width: '100%' }} onClick={() => { setC(x => ({ ...x, username: fu.trim() })); go2('code'); }}>I have a reset code</button></>
    : <><p>Enter your username. A request is sent to the super admin, and you can set a new password only after they approve it.</p>
      <div className="field"><label htmlFor="fp-user">Username</label><input id="fp-user" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} autoFocus value={fu} onChange={e => setFu(e.target.value)} onKeyDown={e => e.key === 'Enter' && askReset()} /></div>
      <button className="pri" style={{ width: '100%' }} disabled={busy} onClick={askReset}>{busy ? 'Sending…' : 'Send request to super admin'}</button>
      <p className="login-notice">Super admin accounts cannot be reset here. The system owner recovers them from the server.</p></>}
    <p><button type="button" className="linkbtn" onClick={() => go2('login')}>Back to sign in</button></p>
    <span className="err" role="alert">{err}</span></div></div>;
  if (mode === 'code') return <div className="login"><div className="panel">{head}
    <h3 className="login-sub">Set a new password</h3>
    <p>Enter the one-time code the super admin gave you after approving your request.</p>
    <div className="field"><label htmlFor="rc-user">Username</label><input id="rc-user" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} autoFocus={!c.username} value={c.username} onChange={e => setC({ ...c, username: e.target.value })} /></div>
    <div className="field"><label htmlFor="rc-code">Reset code</label><input id="rc-code" className="code-input" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={20} autoFocus={!!c.username} placeholder="XXXXX-XXXXX" value={c.code} onChange={e => setC({ ...c, code: e.target.value })} /></div>
    <div className="field"><label htmlFor="rc-new">New password (at least 10 characters)</label><input id="rc-new" type="password" autoComplete="new-password" maxLength={200} value={c.newPassword} onChange={e => setC({ ...c, newPassword: e.target.value })} /><PasswordMeter value={c.newPassword} username={c.username.trim()} /></div>
    <div className="field"><label htmlFor="rc-again">Repeat new password</label><input id="rc-again" type="password" autoComplete="new-password" maxLength={200} value={c.again} onChange={e => setC({ ...c, again: e.target.value })} onKeyDown={e => e.key === 'Enter' && submitCode()} /></div>
    <button className="pri" style={{ width: '100%' }} disabled={busy} onClick={submitCode}>{busy ? 'Saving…' : 'Change password'}</button>
    <p><button type="button" className="linkbtn" onClick={() => go2('forgot')}>I do not have a code yet</button> · <button type="button" className="linkbtn" onClick={() => go2('login')}>Back to sign in</button></p>
    <span className="err" role="alert">{err}</span></div></div>;
  if (mode === 'reset') return <div className="login"><div className="panel">{head}
    <p className="err"><small>TEST ONLY: this lets anyone reset a password with just the username. It is not available in production.</small></p>
    <div className="field"><label htmlFor="rs-user">Username</label><input id="rs-user" autoFocus value={r.username} onChange={e => setR({ ...r, username: e.target.value })} /></div>
    <div className="field"><label htmlFor="rs-new">New password (at least 10 characters)</label><input id="rs-new" type="password" autoComplete="new-password" value={r.newPassword} onChange={e => setR({ ...r, newPassword: e.target.value })} /></div>
    <div className="field"><label htmlFor="rs-again">Repeat new password</label><input id="rs-again" type="password" autoComplete="new-password" value={r.again} onChange={e => setR({ ...r, again: e.target.value })} onKeyDown={e => e.key === 'Enter' && reset()} /></div>
    <button className="pri" style={{ width: '100%' }} disabled={busy} onClick={reset}>Reset password</button>
    <p><button type="button" className="linkbtn" onClick={() => { setMode('login'); setErr(''); }}>Back to sign in</button></p>
    <span className="err" role="alert">{err}</span></div></div>;
  return <div className="login"><div className="panel">
   {head}
    {msg && <p role="status">{msg}</p>}
    <div className="field"><label htmlFor="login-user">Username</label><input id="login-user" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} autoFocus value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></div>
    <div className="field"><label htmlFor="login-pass">Password</label><div className="pw">
      <input id="login-pass" type={show ? 'text' : 'password'} autoComplete="current-password" maxLength={200} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} {...capsOn} onKeyDown={e => { capsOn.onKeyDown(e); if (e.key === 'Enter') go(); }} />
      <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}><EyeIcon off={show} /></button></div><CapsHint on={caps} /></div>
    <button className="pri" style={{ width: '100%' }} disabled={busy} onClick={go}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p className="login-links"><button type="button" className="linkbtn" onClick={() => { setFu(f.username.trim()); go2('forgot'); }}>Forgot password?</button><span aria-hidden="true"> · </span><button type="button" className="linkbtn" onClick={() => { setC(x => ({ ...x, username: f.username.trim() })); go2('code'); }}>I have a reset code</button></p>
    {canReset && <p><button type="button" className="linkbtn" onClick={() => { setMode('reset'); setErr(''); setMsg(''); }}>Quick reset (test only)</button></p>}
    <br/> <span className="err" role="alert">{err}</span>
    <p className="login-notice">Authorised users only. All sign-ins and record access are logged. Sessions end after {IDLE_MINUTES} minutes of inactivity.</p></div></div>;
}

const IC = { users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  ok: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3', no: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M15 9l-6 6M9 9l6 6',
  seat: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z' };
IC.lock = 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4';
const Icon = ({ n }) => <svg viewBox="0 0 24 24"><path d={IC[n]} /></svg>;
const Stat = ({ icon, color, label, value, note }) => <div className="card stat"><div className={`chip ${color}`}><Icon n={icon} /></div>
  <div><span>{label}</span><b>{value.toLocaleString()}</b>{note && <small>{note}</small>}</div></div>;

const KEYS = [['pending', 'Pending', '#e8a317'], ['selected', 'Selected', '#3b5bdb'], ['joined', 'Joined', '#12a36b'], ['notjoined', 'Not Joined', '#e5484d'], ['tc', 'TC', '#7c4dff']];
const ICON = { pending: ['clock', 'amber'], selected: ['star', 'blue'], joined: ['ok', 'green'], notjoined: ['no', 'red'], tc: ['doc', 'violet'] };
const Legend = () => <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--mute)', marginBottom: 12 }}>{KEYS.map(([k, l, c]) =>
  <span key={k}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c, marginRight: 5 }} />{l}</span>)}</div>;

function Donut({ parts }) {
  const total = parts.reduce((a, p) => a + p.v, 0), R = 64, C = 2 * Math.PI * R; let off = 0;
  return <div className="donut"><div className="mid"><svg viewBox="0 0 170 170"><circle cx="85" cy="85" r={R} fill="none" stroke="#eef1f8" strokeWidth="18" />
    {parts.map(p => { const len = total ? (p.v / total) * C : 0, el = <circle key={p.l} cx="85" cy="85" r={R} fill="none" stroke={p.c} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />; off += len; return el; })}</svg>
    <div><b>{total}</b><span>Total</span></div></div>
    <div className="legend">{parts.map(p => <div key={p.l}><i style={{ background: p.c }} />{p.l}<b>{p.v}</b></div>)}</div></div>;
}

function ColumnChart({ rows }) {
  const W = 520, H = 260, L = 40, B = 36, T = 16, nice = m => { const p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p) * p; };
  const top = nice(Math.max(1, ...rows.flatMap(r => KEYS.map(([k]) => r[k])))), ih = H - T - B, gw = (W - L) / Math.max(1, rows.length), bw = Math.min(34, (gw * 0.6) / KEYS.length), y = v => T + ih - (v / top) * ih;
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
    {[0, 1, 2, 3, 4].map(i => { const v = (top / 4) * i; return <g key={i}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#e8ecf4" /><text x={L - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#6b7690">{Math.round(v)}</text></g>; })}
    {rows.map((r, gi) => { const x0 = L + gi * gw + (gw - bw * KEYS.length - 8) / 2; return <g key={r.key}>
      {KEYS.map(([k, , c], i) => <g key={k}><rect x={x0 + i * (bw + 4)} y={y(r[k])} width={bw} height={T + ih - y(r[k])} rx="4" fill={c} />
        <text x={x0 + i * (bw + 4) + bw / 2} y={y(r[k]) - 5} fontSize="11" textAnchor="middle" fill="#1b2437">{r[k]}</text></g>)}
      <text x={L + gi * gw + gw / 2} y={H - 12} fontSize="12" textAnchor="middle" fill="#6b7690">Class {r.key}</text></g>; })}
  </svg>;
}

function Stacked({ title, rows }) {
  const sum = r => KEYS.reduce((a, [k]) => a + (r[k] || 0), 0), list = rows.filter(r => sum(r) > 0).sort((a, b) => sum(b) - sum(a)).slice(0, 8), max = Math.max(1, ...list.map(sum));
  return <div className="panel"><h3>{title}</h3><Legend />{!list.length && <p style={{ color: 'var(--mute)' }}>No data yet.</p>}
    {list.map(r => <div className="bl" key={r.key}><div className="t"><b>{r.key}</b><span>{sum(r)}</span></div>
      <div className="bar">{KEYS.map(([k, l, c]) => <i key={k} title={`${l}: ${r[k]}`} style={{ width: `${(100 * r[k]) / max}%`, background: c }} />)}</div></div>)}</div>;
}

function Dashboard({ user }) {
  const [d, setD] = useState(null), [err, setErr] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p>Loading…</p>;
  const tot = k => d.byClass.reduce((a, r) => a + r[k], 0);
  const split = k => d.byClass.map(r => `Class ${r.key}: ${r[k]}`).join('  ·  ');
  return <>
    <div className="head"><h1>Dashboard</h1><span className="pill">{['SUPER_ADMIN', 'STATE'].includes(user.role) ? 'All regions' : user.region || user.district}</span></div>
    <div className="grid stats">{KEYS.map(([k, l]) => <Stat key={k} icon={ICON[k][0]} color={ICON[k][1]} label={l} value={tot(k)} note={split(k)} />)}</div>
    <div className="grid two">
      <div className="panel"><h3>Overall share</h3><Donut parts={KEYS.map(([k, l, c]) => ({ l, c, v: tot(k) }))} /></div>
      <div className="panel"><h3>Class comparison</h3><Legend /><ColumnChart rows={d.byClass} /></div>
    </div>
    <div className="grid two" style={{ marginTop: 16 }}>
      <Stacked title="By district" rows={d.byDistrict} /><Stacked title="By community" rows={d.byCommunity} />
    </div></>;
}

function StudentModal({ id, user, onClose, onChange }) {
  const [s, setS] = useState(null), [letter, setLetter] = useState(''), [err, setErr] = useState(''), [remarks, setRemarks] = useState(''), [rv, setRv] = useState(''), [note, setNote] = useState('');
  const load = () => api('/students/' + id).then(setS).catch(e => setErr(e.message)); useEffect(() => { load(); }, [id]);
  if (!s) return err ? <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel"><p className="err">{err}</p></div></div> : null;
  const act = async (fn) => { try { await fn(); setErr(''); await load(); onChange(); } catch (e) { setErr(e.message); } };
  const patch = body => act(() => api('/students/' + id, { method: 'PATCH', body }));
  const verify = decision => act(() => api(`/students/${id}/verify`, { method: 'POST', body: { decision, remarks } }));
  const isPending = !s.selectStatus && !s.admitStatus && s.willingStatus !== 'UNWILLING', isSelected = s.selectStatus && !s.admitStatus;
  const canAdmit = s.willingStatus !== 'UNWILLING' || s.verificationStatus === 'REJECTED';
  return <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel" onClick={e => e.stopPropagation()}>
    <h3>{s.name} <StatusBadge r={s} /></h3>
    <table><tbody>{[['Reg no', s.regno], ['EMIS', s.emisNo], ['Class', s.classLevel], ['Gender / Medium', `${s.gender} / ${s.medium}`],
      ['Community', s.community + (s.disability ? ' (PWD)' : '')], ['District / Region', `${s.district} / ${s.regionalCentre}`],
      ['Merit (total / rank)', `${s.total} / ${s.orank}`], ['Selected against', s.selectedCategory || '—'], ['Took seat of (regno)', s.replacesRegno || '—']].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
    {['DISTRICT', 'SUPER_ADMIN'].includes(user.role) && (isPending || isSelected) && <><h4>Update status</h4>
      <div className="row2">{isPending
        ? <><button className="pri" onClick={() => patch({ action: 'SELECT' })}>Selected</button></>
        : <><button className="pri" onClick={() => patch({ admitStatus: 'Admitted' })}>Joined</button><button className="bad" onClick={() => patch({ admitStatus: 'Not Admitted' })}>Not Joined</button></>}</div></>}
    {user.role === 'SUPER_ADMIN' && (s.admitStatus || '').startsWith('Not Admitted') && <>
      <h4>Revert for admission</h4>
      
      <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (required)" value={rv} onChange={e => setRv(e.target.value)} />
      <div className="row2"><button className="bad" onClick={() => window.confirm('Take this student back for admission? Vacancy will be checked first.') && act(async () => { setNote(''); const r = await api(`/students/${id}/revert`, { method: 'POST', body: { remarks: rv } }); setNote(r.removed ? `Reinstated. Seat taken from ${r.removedName} (reg ${r.removed}), who is back in the pool.` : 'Reinstated using a free vacancy.'); })}>Revert &amp; admit later</button></div></>}
    {user.role === 'SUPER_ADMIN' && s.admitStatus === 'Admitted' && <>
      <h4>Revoke admission</h4>
      <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (required)" value={rv} onChange={e => setRv(e.target.value)} />
      <div className="row2"><button className="bad" onClick={() => window.confirm('Revoke this admission? The vacancy is restored.') && act(async () => { setNote(''); await api(`/students/${id}/revoke-admission`, { method: 'POST', body: { remarks: rv } }); setNote('Admission revoked. Vacancy restored.'); })}>Revoke admission</button></div></>}
    {user.role === 'SUPER_ADMIN' && (s.admitStatus || '').startsWith('TC Issued') && <>
      <h4>Revert TC</h4>
      <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (required)" value={rv} onChange={e => setRv(e.target.value)} />
      <div className="row2"><button className="bad" onClick={() => window.confirm('Revert this TC? Vacancy is checked first.') && act(async () => { setNote(''); await api(`/students/${id}/revert-tc`, { method: 'POST', body: { remarks: rv } }); setNote('TC reverted. Student is admitted again.'); })}>Revert TC</button></div></>}
    {note && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{note}</p>}
    {err && <p className="err">{err}</p>}
    <h4>History</h4>{s.logs.map(l => <div key={l.id}><small>{new Date(l.changedAt).toLocaleString()} · {l.changedBy} · {l.field}: {l.oldValue || '—'} → {l.newValue}</small></div>)}
    <div className="row2"><button onClick={onClose}>Close</button></div></div></div>;
}

const TABS = [['pending', 'Pending'], ['selected', 'Selected'], ['joined', 'Joined'], ['notjoined', 'Not Joined'], ['tc', 'TC']];
const StatusBadge = ({ r }) => {
  const raw = r.admitStatus || r.selectStatus;
  const [text, cls] = /^TC Issued/.test(raw) ? ['TC', 'TCIssued'] : /^Not Admitted/.test(raw) ? ['Not Joined', 'NotAdmitted'] : raw === 'Admitted' ? ['Joined', 'Admitted'] : raw ? ['Selected', 'Selected']
    : r.willingStatus === 'UNWILLING' ? ['Not Joined', 'NotAdmitted'] : ['Pending', 'PENDING'];
  return <span className={`badge ${cls}`}>{text}</span>;
};

function StudentDetails({ user }) {
  const [cls, setCls] = useState(9), [tab, setTab] = useState('selected'), [data, setData] = useState({ rows: [], pages: 1 });
  const [search, setSearch] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1), [open, setOpen] = useState(null), [reload, setReload] = useState(0), [listErr, setListErr] = useState('');
  const load = () => setReload(n => n + 1);
  useEffect(() => { const t = setTimeout(() => setQ(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [cls, tab, q]);
  useEffect(() => {
    let stale = false;
    api(`/students?class=${cls}&view=${tab}&search=${encodeURIComponent(q)}&page=${page}`).then(d => { if (!stale) { setData(d); setListErr(''); } }).catch(e => !stale && setListErr(e.message));
    return () => { stale = true; };
  }, [cls, tab, q, page, reload]);
  return <>
    <div className="head"><h1>Student Details</h1></div>
    <div className="tabs">{[9, 10].map(c => <button key={c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)}>Class {c}</button>)}</div>
    <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    <div className="panel">
      <div className="row2"><input aria-label="Search name / EMIS" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      {listErr && <p className="err">{listErr}</p>}
      <table><thead><tr><th>Reg no</th><th>Name</th><th>District</th><th>Comm.</th><th>Total</th><th>Seat</th><th>Status</th></tr></thead>
        <tbody>{data.rows.map(r => <tr className="row" key={r.id} onClick={() => setOpen(r.id)}>
          <td>{r.regno}</td><td>{r.name}</td><td>{r.district}</td><td>{r.community}</td><td>{r.total}</td><td>{r.selectedCategory || '—'}</td><td><StatusBadge r={r} /></td></tr>)}</tbody></table>
      {!data.rows.length && <p style={{ color: 'var(--mute)' }}>No students in this view.</p>}
      {data.pages > 1 && <div className="row2"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>Page {page} / {data.pages}<button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
    {open && <StudentModal id={open} user={user} onClose={() => setOpen(null)} onChange={load} />}</>;
}

// Vacancies, seat by seat: every seat says who it is reserved for (or taken by), or that it is vacant.
const SEAT_TAG = { RESERVED: ['Reserved', 'RESERVED'], ADMITTED: ['Joined', 'Admitted'], VACANT: ['Vacant', 'VACANT'] };
const SEAT_TABS = [['', 'All seats'], ['RESERVED', 'Reserved'], ['ADMITTED', 'Joined'], ['VACANT', 'Vacant']];
const seatHolder = r => r.hidden ? (r.status === 'ADMITTED' ? 'Taken by a student of another district' : 'Reserved for a student of another district')
  : r.studentName ? <><b>{r.studentName}</b> · Reg no {r.regno}</>
  : r.status === 'ADMITTED' ? 'Filled earlier (before this portal)' : r.status === 'VACANT' ? 'Not reserved yet' : '—';

function SeatList({ user }) {
  const [cls, setCls] = useState(9), [tab, setTab] = useState(''), [search, setSearch] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const [d, setD] = useState({ rows: [], pages: 1, counts: {} }), [err, setErr] = useState(''), [open, setOpen] = useState(null), [reload, setReload] = useState(0);
  useEffect(() => { const t = setTimeout(() => setQ(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [cls, tab, q]);
  useEffect(() => {
    let stale = false;
    api(`/seats?class=${cls}&status=${tab}&search=${encodeURIComponent(q)}&page=${page}`).then(r => { if (!stale) { setD(r); setErr(''); } }).catch(e => !stale && setErr(e.message));
    return () => { stale = true; };
  }, [cls, tab, q, page, reload]);
  const c = d.counts || {}, all = (c.RESERVED || 0) + (c.ADMITTED || 0) + (c.VACANT || 0);
  return <>
    <div className="head"><h1>Vacancies</h1></div>
    <div className="tabs">{[9, 10].map(k => <button key={k} className={cls === k ? 'on' : ''} onClick={() => setCls(k)}>Class {k}</button>)}</div>
    <div className="tabs">{SEAT_TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} ({k ? c[k] || 0 : all})</button>)}</div>
    <div className="panel">
      <div className="row2"><input aria-label="Search by student name or reg no" placeholder="Search student name / reg no" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {err && <p className="err">{err}</p>}
      <table><thead><tr><th>Seat</th><th>Regional centre</th><th>Gender</th><th>Medium</th><th>Community</th><th>Status</th><th>Reserved for</th></tr></thead>
        <tbody>{d.rows.map(r => <tr className={r.studentId ? 'row' : ''} key={r.seatCode} onClick={() => r.studentId && setOpen(r.studentId)}>
          <td>{r.seatCode}</td><td>{r.regionalCentre}</td><td>{r.gender}</td><td>{r.medium}</td><td>{r.community}</td>
          <td><span className={`badge ${SEAT_TAG[r.status][1]}`}>{SEAT_TAG[r.status][0]}</span></td><td>{seatHolder(r)}</td></tr>)}</tbody></table>
      {!d.rows.length && !err && <p style={{ color: 'var(--mute)' }}>No seats in this view.</p>}
      {d.pages > 1 && <div className="row2"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>Page {page} / {d.pages}<button disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
    {open && <StudentModal id={open} user={user} onClose={() => setOpen(null)} onChange={() => setReload(n => n + 1)} />}</>;
}

IC.doc = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8';
const b64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });

function AdmittedPicker({ onPick, progress, docsOpen }) {
  const [q, setQ] = useState(''), [term, setTerm] = useState(''), [page, setPage] = useState(1), [d, setD] = useState({ rows: [], pages: 1 }), [err, setErr] = useState('');
  useEffect(() => { let stale = false; api(`/students?view=admitted&search=${encodeURIComponent(term)}&page=${page}${docsOpen ? '&docsOpen=1' : ''}`).then(r => !stale && (setD(r), setErr(''))).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [term, page]);
  return <div className="panel"><h3>Admitted students</h3>
    <div className="row2"><input aria-label="Search by name / EMIS" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPage(1), setTerm(q))} /><button className="pri" onClick={() => { setPage(1); setTerm(q); }}>Search</button></div>
    {err && <p className="err">{err}</p>}
    <table><thead><tr><th>Reg no</th><th>Name</th><th>Class</th><th>Gender</th><th>Community</th><th>District</th><th>Total</th>{progress && <th>Documents</th>}</tr></thead>
      <tbody>{d.rows.map(r => <tr className="row" key={r.id} onClick={() => onPick(r)}><td>{r.regno}</td><td>{r.name}</td><td>{r.classLevel}</td><td>{r.gender}</td><td>{r.community}</td><td>{r.district}</td><td>{r.total}</td>{progress && (p => <td><span className={`badge ${p.verified === REQUIRED.length ? 'VERIFIED' : p.submitted === REQUIRED.length ? 'PENDING' : ''}`}>{p.submitted}/{REQUIRED.length}</span></td>)(progress[r.id] || { submitted: 0, verified: 0 })}</tr>)}</tbody></table>
    {!d.rows.length && <p style={{ color: 'var(--mute)' }}>No admitted students found.</p>}
    {d.pages > 1 && <div className="row2"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>Page {page} / {d.pages}<button disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button></div>}</div>;
}

function TcPopup({ s, onClose, onDone }) {
  const [reason, setReason] = useState(''), [file, setFile] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => { try { if (!file) throw new Error('Attach the unwilling / request letter'); setBusy(true);
    await api('/tc', { method: 'POST', body: { studentId: s.id, reason, fileName: file.name, fileData: await b64(file) } }); onDone(); } catch (e) { setErr(e.message); setBusy(false); } };
  return <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel" onClick={e => e.stopPropagation()}>
    <h3>Raise TC request · {s.name}</h3>
    <table><tbody>{[['Reg no', s.regno], ['EMIS no', s.emisNo], ['Class', s.classLevel], ['Gender / Medium', `${s.gender} / ${s.medium}`], ['Community', s.community + (s.disability ? ' (PWD)' : '')],
      ['District / Region', `${s.district} / ${s.regionalCentre}`], ['School', s.schoolName || '—'], ['Merit (total / rank)', `${s.total} / ${s.orank}`], ['Seat category', s.selectedCategory || '—'], ['Phone', s.phone || '—'], ['Status', s.admitStatus]]
      .map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
    <h4>TC request</h4>
    <textarea rows="3" style={{ width: '100%' }} aria-label="Reason for TC (required)" value={reason} onChange={e => setReason(e.target.value)} />
    <div className="row2"><label>TC request letter (PDF, JPG or PNG, max 3 MB)<br /><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files[0])} /></label></div>
    {err && <p className="err">{err}</p>}
    <div className="row2"><button className="pri" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</button><button onClick={onClose}>Cancel</button></div></div></div>;
}


const TC_LEVEL = { REGION: 'RC', STATE: 'SC', ADMIN: 'Super Admin' };
const TC_MINE = { REGION: 'REGION', STATE: 'STATE', SUPER_ADMIN: 'ADMIN' };
const tcTag = r => r.status === 'APPROVED' ? ['TC APPROVED', 'APPROVED']
  : r.status === 'REJECTED' ? [`NOT APPROVED BY ${TC_LEVEL[r.rejectedLevel || 'ADMIN'].toUpperCase()}`, 'REJECTED']
  : r.status === 'CANCELLED' ? ['CANCELLED', '']
  : r.stage === 'STATE' ? ['APPROVED BY RC', 'RCAPPROVED'] : r.stage === 'ADMIN' ? ['APPROVED BY SC', 'SCAPPROVED'] : ['AWAITING RC', 'PENDING'];
const TcTag = ({ r }) => { const [t, c] = tcTag(r); return <span className={`badge ${c}`}>{t}</span>; };

const tcTrail = r => [['RC', 'Regional coordinator', r.rcBy, r.rcAt, r.rcRemarks, r.rejectedLevel === 'REGION'],
  ['SC', 'State coordinator', r.scBy, r.scAt, r.scRemarks, r.rejectedLevel === 'STATE'],
  ['Super Admin', 'Super admin', r.reviewedBy, r.reviewedAt, r.reviewRemarks, r.rejectedLevel === 'ADMIN']].filter(x => x[2]);

function TcRequests({ user }) {
  const mine = TC_MINE[user.role], canDecide = !!mine;
  const [tab, setTab] = useState(user.role === 'DISTRICT' ? 'RAISE' : canDecide ? 'TODO' : 'PENDING'), [rows, setRows] = useState([]), [err, setErr] = useState(''), [open, setOpen] = useState(null), [picked, setPicked] = useState(null), [n, setN] = useState(0), [rm, setRm] = useState(''), [pv, setPv] = useState(null);
  useEffect(() => {                                                                                   
    if (!open) return; let u;
    fileBlob(`/tc/${open.id}/letter`).then(b => { u = URL.createObjectURL(b); setPv({ url: u, type: b.type }); }).catch(e => setPv({ error: e.message }));
    return () => { setPv(null); u && URL.revokeObjectURL(u); };
  }, [open?.id]);
  useEffect(() => { if (tab === 'RAISE') return; let stale = false; api(tab === 'TODO' ? `/tc?status=PENDING&stage=${mine}` : `/tc?status=${tab}`).then(r => !stale && (setRows(r), setErr(''))).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [tab, n]);
  const review = async decision => { try { await api(`/tc/${open.id}/review`, { method: 'POST', body: { decision, remarks: rm } }); setOpen(null); setRm(''); setErr(''); setN(x => x + 1); } catch (e) { setErr(e.message); } };
  const myTurn = open && open.status === 'PENDING' && open.stage === mine;
  return <>
    <div className="head"><div><h1>TC Requests</h1></div>
</div>
    <div className="tabs">{[...(user.role === 'DISTRICT' ? [['RAISE', 'Raise TC request']] : []), ...(canDecide ? [['TODO', 'Awaiting my decision']] : []), ['PENDING', 'TC Requested'], ['APPROVED', 'TC Students'], ['REJECTED', 'Not Approved']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'RAISE' ? <AdmittedPicker onPick={setPicked} /> : <div className="panel">{err && <p className="err">{err}</p>}
      <table><thead><tr><th>Reg no</th><th>Name</th><th>Class</th><th>District</th><th>Reason</th><th>Requested</th><th>Admit status</th><th>TC status</th></tr></thead>
        <tbody>{rows.map(r => <tr className="row" key={r.id} onClick={() => { setOpen(r); setRm(''); setErr(''); }}><td>{r.regno}</td><td>{r.name}</td><td>{r.classLevel}</td><td>{r.district}</td>
          <td>{r.reason.slice(0, 40)}</td><td>{new Date(r.requestedAt).toLocaleDateString()}</td><td><StatusBadge r={r} /></td><td><TcTag r={r} /></td></tr>)}</tbody></table>
      {!rows.length && <p style={{ color: 'var(--mute)' }}>{tab === 'TODO' ? 'Nothing is waiting for your decision.' : 'No records.'}</p>}</div>}
    {open && <div className="modal" role="dialog" aria-modal="true" onClick={() => setOpen(null)}><div className="panel" style={{ width: 960, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
      <h3>TC request · {open.name} <TcTag r={open} /></h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18 }}>
        <div><table><tbody>{[['Reg no', open.regno], ['Class', open.classLevel], ['Gender / Community', `${open.gender} / ${open.community}`], ['District / Region', `${open.district} / ${open.regionalCentre}`], ['Admit status', <StatusBadge r={open} />], ['Reason', open.reason],
          ['Requested by', `${open.requestedBy} on ${new Date(open.requestedAt).toLocaleString()}`],
          ...tcTrail(open).flatMap(([short, long, by, at, msg, no]) => [[long, <>{no ? 'Not approved' : 'Approved'} by {by} on {new Date(at).toLocaleString()}</>], [`${short} message`, msg || '—']]),
          ...(open.status === 'PENDING' ? [['Now with', open.stage === 'REGION' ? 'Regional coordinator (RC)' : open.stage === 'STATE' ? 'State coordinator (SC)' : 'Super admin']] : [])].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
          {myTurn && <><h4>Your decision ({TC_LEVEL[mine]})</h4>
            <textarea rows="3" style={{ width: '100%' }} aria-label="Message (required)" value={rm} onChange={e => setRm(e.target.value)} />
            <div className="row2"><button className="pri" onClick={() => review('APPROVED')}>Approve TC</button><button className="bad" onClick={() => review('REJECTED')}>Do not approve</button></div>
            <p><small>{mine === 'ADMIN' ? 'Approving issues the TC and releases the seat.' : `Approving sends this request to the ${mine === 'REGION' ? 'state coordinator' : 'super admin'}. Not approving ends it here.`}</small></p></>}
          {user.role === 'SUPER_ADMIN' && open.status === 'APPROVED' && <><h4>Revert TC</h4>
            <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (required)" value={rm} onChange={e => setRm(e.target.value)} />
            <div className="row2"><button className="bad" onClick={async () => { try { await api(`/students/${open.studentId}/revert-tc`, { method: 'POST', body: { remarks: rm } }); setOpen(null); setRm(''); setErr(''); setN(x => x + 1); } catch (e) { setErr(e.message); } }}>Revert TC</button></div></>}
          {err && <p className="err">{err}</p>}</div>
        <div><h4 style={{ marginTop: 0 }}>Request letter ({open.letterName})</h4>
          {!pv ? <p>Loading letter…</p> : pv.error ? <p className="err">{pv.error}</p>
            : pv.type.startsWith('image') ? <img src={pv.url} alt="Request letter" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
            : <iframe src={pv.url} title="Request letter" style={{ width: '100%', height: 440, border: '1px solid var(--line)', borderRadius: 10 }} />}
          {pv?.url && <p><a href={pv.url} target="_blank" rel="noopener noreferrer">Open letter in a new tab</a></p>}</div></div>
      <div className="row2"><button onClick={() => { setOpen(null); setErr(''); }}>Close</button></div></div></div>}
    {picked && <TcPopup s={picked} onClose={() => setPicked(null)} onDone={() => { setPicked(null); setTab('PENDING'); setN(x => x + 1); }} />}</>;
}

IC.up = 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12';

function Uploader({ title, hint, path, cls, canReplace }) {
  const [file, setFile] = useState(null), [replace, setReplace] = useState(false), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [err, setErr] = useState('');
  const go = async () => {
    try {
      if (!file) throw new Error('Choose an Excel (.xlsx) file first');
      if (replace && !window.confirm(`This deletes ALL existing Class ${cls} students, their history and TC requests before importing. Continue?`)) return;
      setBusy(true); setErr(''); setRes(null);
      setRes(await api(path, { method: 'POST', body: { classLevel: cls, replace, fileData: await b64(file) } }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <div className="panel"><h3>{title}</h3>
    <div className="row2"><input type="file" accept=".xlsx,.xls" onChange={e => { setFile(e.target.files[0]); setRes(null); }} /></div>
    {canReplace && <label className="row2"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} /> Replace existing Class {cls} students (start fresh)</label>}
    <div className="row2"><button className="pri" disabled={busy} onClick={go}>{busy ? 'Importing…' : `Import for Class ${cls}`}</button></div>
    {err && <p className="err">{err}</p>}
    {res && <div><p><b>{res.imported}</b> imported{res.skippedExisting ? <>, {res.skippedExisting} skipped (already exist)</> : ''}{res.rejectedCount ? <>, <span className="err">{res.rejectedCount} rejected</span></> : ''}.</p>
      {res.rejected?.length > 0 && <table><thead><tr><th>Excel row</th><th>Problem</th></tr></thead><tbody>{res.rejected.map(r => <tr key={r.row}><td>{r.row}</td><td>{r.reason}</td></tr>)}</tbody></table>}
      {res.newUsers?.length > 0 && <><h4>New logins created</h4><p className="err"><small>Copy these now. Passwords are shown only once.</small></p>
        <table><thead><tr><th>Role</th><th>For</th><th>Username</th><th>Password</th></tr></thead><tbody>{res.newUsers.map(u => <tr key={u.username}><td>{u.role}</td><td>{u.scope}</td><td>{u.username}</td><td><code>{u.password}</code></td></tr>)}</tbody></table></>}</div>}
  </div>;
}

function ImportData() {
  const [cls, setCls] = useState(9);
  return <>
    <div className="head"><div><h1>Import Data</h1></div></div>
    <div className="tabs">{[9, 10].map(c => <button key={c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)}>Class {c}</button>)}</div>
    <div className="grid two">
      <Uploader key={'s' + cls} title="1. Students sheet" cls={cls} path="/import/students" canReplace
        hint="Columns: Regional_centre, District, school_name, Emis_No, name, dob, Gender (Boy/Girl), Disability_status (Yes/No), Community, Medium, TOTAL, REGNO, ORANK, PHONE_NUMBER. Optional: Select_Status, Selected_category, Admit_status, or a Class column (9/10)." />
      <Uploader key={'v' + cls} title="2. Vacancies sheet" cls={cls} path="/import/vacancies"
        hint="Columns: Regional_centre, Gender, Medium, Community (GT-PWD, GT, BC, BCM, MBC, SC, SCA, ST), Admitted, Vacancies. Replaces this class's vacancies (not allowed once selection has started)." />
    </div>
    </>;
}

IC.log = 'M4 6h16M4 12h16M4 18h10';
const ts = d => { const t = new Date(d), p = (n, l = 2) => String(n).padStart(l, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}.${p(t.getMilliseconds(), 3)}`; };
const ACTIONS = ['FREEZE', 'UNFREEZE', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_APPROVED', 'PASSWORD_RESET_REJECTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_RESET_FAILED', 'PASSWORD_RESET_BLOCKED', 'SUPERADMIN_RECOVERY', 'LOGIN_BLOCKED', 'LOGIN', 'LOGOUT', 'VIEW', 'SELECT', 'NOT_WILLING', 'LOGIN_FAILED', 'IMPORT_STUDENTS', 'IMPORT_VACANCIES', 'SELECTION_RUN', 'ADMIT', 'NOT_ADMIT', 'UNWILLING', 'WILLING', 'VERIFY_ACCEPTED', 'VERIFY_REJECTED', 'REVERT', 'REVERT_TC', 'EXPORT_MASTER', 'EXPORT_VACANCIES', 'REVOKE_ADMISSION', 'DOC_UPLOAD', 'DOC_EDIT', 'DOC_RESUBMIT', 'DOC_VERIFIED', 'DOC_REJECTED', 'TC_RAISE', 'TC_RC_APPROVED', 'TC_RC_REJECTED', 'TC_SC_APPROVED', 'TC_SC_REJECTED', 'TC_APPROVED', 'TC_REJECTED', 'REVOKE', 'PASSWORD_RESET_TEST'];
const logLine = e => `${e.level === 'INFO' ? '.' : '!'} ${ts(e.at)} [${e.actor}] ${e.action.padEnd(16)} ${e.regno ? `reg ${e.regno} ` : ''}${e.message}${e.revokedAt ? '  [REVOKED]' : ''}`;

function Logs() {
  const [view, setView] = useState('history'), [rows, setRows] = useState([]), [f, setF] = useState({ level: '', action: '', q: '' }), [live, setLive] = useState(true);
  const [err, setErr] = useState(''), [n, setN] = useState(0), [rv, setRv] = useState(null), [rm, setRm] = useState(''), box = useRef(null);
  const qs = `level=${f.level}&action=${f.action}&q=${encodeURIComponent(f.q)}`;
  useEffect(() => {
    let stale = false; const load = () => api('/logs?' + qs).then(r => !stale && (setRows(r), setErr(''))).catch(e => !stale && setErr(e.message));
    load(); const t = live && setInterval(load, 3000); return () => { stale = true; t && clearInterval(t); };
  }, [qs, live, n]);
  useEffect(() => { if (view === 'console' && box.current) box.current.scrollTop = box.current.scrollHeight; }, [rows, view]);
  const revoke = async () => { try { await api(`/logs/${rv.id}/revoke`, { method: 'POST', body: { remarks: rm } }); setRv(null); setRm(''); setErr(''); setN(x => x + 1); } catch (e) { setErr(e.message); } };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(logLine).join('\n')], { type: 'text/plain' })); a.download = `admissions-${new Date().toISOString().slice(0, 10)}.log`; a.click(); };
  return <>
    <div className="head"><h1>Logs</h1><div className="row2" style={{ margin: 0 }}>
      <label><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Live</label><button onClick={download}>Download .log</button></div></div>
    <div className="tabs">{[['history', 'History'], ['console', 'Console']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
    <div className="row2"><input aria-label="Search user / reg no / text" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
      <select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}><option value="">All levels</option><option>INFO</option><option>WARN</option></select>
      <select value={f.action} onChange={e => setF({ ...f, action: e.target.value })}><option value="">All actions</option>{ACTIONS.map(a => <option key={a}>{a}</option>)}</select></div>
    {err && <p className="err">{err}</p>}
    {view === 'console' ? <div className="console" ref={box}>{rows.map(e => <div key={e.id} className={e.level === 'INFO' ? 'li' : 'lw'}>{logLine(e)}</div>)}{!rows.length && <div className="li">. No log entries</div>}</div>
    : <div className="panel"><table><thead><tr><th>#</th><th>Time</th><th>User</th><th>Action</th><th>Reg no</th><th>Details</th><th></th></tr></thead>
      <tbody>{[...rows].reverse().map(e => <tr key={e.id}><td>{e.id}</td><td>{ts(e.at).slice(0, 19)}</td><td>{e.actor}</td><td><span className={`badge ${e.level === 'WARN' ? 'PENDING' : ''}`}>{e.action}</span></td><td>{e.regno || ''}</td>
        <td>{e.message}</td><td>{e.revokedAt ? <span className="badge REJECTED">Revoked</span> : e.canRevoke ? <button className="bad" onClick={() => { setRv(e); setRm(''); setErr(''); }}>Revoke</button> : ''}</td></tr>)}</tbody></table></div>}
    {rv && <div className="modal" role="dialog" aria-modal="true" onClick={() => setRv(null)}><div className="panel" onClick={e => e.stopPropagation()}>
      <h3>Revoke #{rv.id} · {rv.action}</h3><p>{rv.message}</p>
      <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (required)" value={rm} onChange={e => setRm(e.target.value)} />
      {err && <p className="err">{err}</p>}<div className="row2"><button className="bad" onClick={revoke}>Revoke</button><button onClick={() => setRv(null)}>Cancel</button></div></div></div>}</>;
}

function UsersPage({ me }) {
  const [rows, setRows] = useState([]), [err, setErr] = useState(''), [q, setQ] = useState(''), [n, setN] = useState(0), [tg, setTg] = useState(null), [why, setWhy] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let stale = false; api('/users').then(r => !stale && (setRows(r), setErr(''))).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [n]);
  const term = q.trim().toLowerCase(), shown = rows.filter(u => !term || [u.username, u.role, u.region, u.district].some(v => String(v || '').toLowerCase().includes(term)));
  const act = async (u, path, body) => { try { setBusy(true); await api(`/users/${u.id}/${path}`, { method: 'POST', body }); setTg(null); setWhy(''); setErr(''); setN(x => x + 1); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return <>
    <div className="head"><h1>Users &amp; Access</h1></div>
    <p><small>Freezing a user signs them out of every device immediately and blocks sign-in until you unfreeze them. Their data and history are kept.</small></p>
    <div className="row2"><input aria-label="Search users" placeholder="Search user, role, district…" value={q} onChange={e => setQ(e.target.value)} /></div>
    {err && !tg && <p className="err" role="alert">{err}</p>}
    <div className="panel"><table><thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Devices now</th><th>Access</th><th></th></tr></thead>
      <tbody>{shown.map(u => <tr key={u.id}><td>{u.username}</td><td>{u.role === 'STATE' ? 'STATE COORDINATOR' : u.role.replace('_', ' ')}</td><td>{u.district || u.region || '—'}</td><td>{u.activeDevices}</td>
        <td>{u.frozenAt ? <><span className="badge REJECTED">Frozen</span><br /><small>{u.frozenReason} · by {u.frozenBy}</small></> : <span className="badge APPROVED">Active</span>}</td>
        <td>{u.id === me.id ? <small>(you)</small> : u.frozenAt ? <button disabled={busy} onClick={() => act(u, 'unfreeze')}>Unfreeze</button> : <button className="bad" onClick={() => { setTg(u); setWhy(''); setErr(''); }}>Freeze</button>}</td></tr>)}
        {!shown.length && <tr><td colSpan="6">No users</td></tr>}</tbody></table></div>
    {tg && <div className="modal" role="dialog" aria-modal="true" onClick={() => setTg(null)}><div className="panel" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
      <h3>Freeze {tg.username}</h3><p>They will be signed out on all devices right now and cannot sign in until you unfreeze them.</p>
      <textarea rows="2" style={{ width: '100%' }} aria-label="Reason (required)" placeholder="Reason (required)" autoFocus value={why} onChange={e => setWhy(e.target.value)} />
      {err && <p className="err" role="alert">{err}</p>}<div className="row2"><button className="bad" disabled={busy} onClick={() => act(tg, 'freeze', { reason: why })}>Freeze access</button><button onClick={() => setTg(null)}>Cancel</button></div></div></div>}</>;
}

const when = v => (v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
function PasswordRequests({ onCount }) {
  const [data, setData] = useState({ pending: 0, rows: [] }), [err, setErr] = useState(''), [n, setN] = useState(0), [busy, setBusy] = useState(false), [tab, setTab] = useState('open');
  const [shown, setShown] = useState(null), [copied, setCopied] = useState(false), [rej, setRej] = useState(null), [why, setWhy] = useState('');
  useEffect(() => { let stale = false; api('/password-resets').then(r => { if (stale) return; setData(r); setErr(''); onCount?.(r.pending); }).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [n]);
  const run = async (r, path, body) => { try { setBusy(true); const d = await api(`/password-resets/${r.id}/${path}`, { method: 'POST', body }); setErr(''); setN(x => x + 1); return d; } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const approve = async r => { const d = await run(r, 'approve'); if (d) { setShown(d); setCopied(false); } };
  const reject = async () => { if (await run(rej, 'reject', { remarks: why })) { setRej(null); setWhy(''); } };
  const copy = async () => { try { await navigator.clipboard.writeText(shown.code); setCopied(true); } catch { setErr('Copying is blocked by the browser. Select the code and copy it manually.'); } };
  const open = data.rows.filter(r => ['PENDING', 'APPROVED'].includes(r.status)), closed = data.rows.filter(r => !['PENDING', 'APPROVED'].includes(r.status)), rows = tab === 'open' ? open : closed;
  return <>
    <div className="head"><h1>Password Requests</h1></div>
    <p><small>Users who forgot their password send a request here. Nothing changes until you approve it. Approving creates a one-time code that you give to the user yourself (phone or in person); it is shown only once. Super admin accounts are not part of this process.</small></p>
    <div className="tabs" role="tablist"><button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>Open ({open.length})</button><button className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>History ({closed.length})</button></div>
    {err && !rej && <p className="err" role="alert">{err}</p>}
    <div className="panel"><table><thead><tr><th>Requested</th><th>User</th><th>Scope</th><th>From</th><th>Status</th><th>{tab === 'open' ? 'Action' : 'Decision'}</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{when(r.requestedAt)}</td><td><b>{r.username}</b><br /><small>{r.role === 'STATE' ? 'STATE COORDINATOR' : (r.role || '').replaceAll('_', ' ')}</small></td><td>{r.district || r.region || '—'}</td><td><small>{r.requestedIp || '—'}</small></td>
        <td>{badge(r.status === 'COMPLETED' ? 'APPROVED' : r.status)}{r.status === 'COMPLETED' && <><br /><small>Password changed {when(r.completedAt)}</small></>}{r.status === 'APPROVED' && <><br /><small>Code valid until {when(r.expiresAt)}</small></>}</td>
        <td>{tab === 'open'
          ? <div className="row2" style={{ margin: 0 }}>{r.status === 'PENDING' && <button className="pri" disabled={busy} onClick={() => approve(r)}>Approve</button>}<button className="bad" disabled={busy} onClick={() => { setRej(r); setWhy(''); setErr(''); }}>{r.status === 'PENDING' ? 'Reject' : 'Cancel code'}</button></div>
          : <small>{r.decidedBy ? `By ${r.decidedBy}, ${when(r.decidedAt)}` : '—'}{r.decisionRemarks ? <><br />{r.decisionRemarks}</> : null}</small>}</td></tr>)}
        {!rows.length && <tr><td colSpan="6">{tab === 'open' ? 'No open requests' : 'No earlier requests'}</td></tr>}</tbody></table></div>
    {shown && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rc-title"><div className="panel" style={{ width: 460 }}>
      <h3 id="rc-title">Request approved for {shown.username}</h3>
      <p>Give this one-time code to {shown.username} yourself (phone or in person). They enter it with their username on the sign-in page, under “I have a reset code”.</p>
      <div className="code-box" aria-live="polite">{shown.code}</div>
      <p><small>Valid until {when(shown.expiresAt)}. It is shown only now and cannot be looked up later. If it is lost, cancel this request and ask the user to send a new one.</small></p>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row2"><button className="pri" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button><button onClick={() => { setShown(null); setErr(''); }}>I have noted the code</button></div></div></div>}
    {rej && <div className="modal" role="dialog" aria-modal="true" onClick={() => setRej(null)}><div className="panel" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
      <h3>{rej.status === 'PENDING' ? 'Reject' : 'Cancel'} request from {rej.username}</h3>
      <p>{rej.status === 'PENDING' ? 'The user will not be able to change their password with this request.' : 'The code that was issued will stop working.'}</p>
      <textarea rows="2" style={{ width: '100%' }} aria-label="Remarks (optional)" placeholder="Remarks (optional)" maxLength={300} autoFocus value={why} onChange={e => setWhy(e.target.value)} />
      {err && <p className="err" role="alert">{err}</p>}<div className="row2"><button className="bad" disabled={busy} onClick={reject}>{rej.status === 'PENDING' ? 'Reject request' : 'Cancel code'}</button><button onClick={() => setRej(null)}>Back</button></div></div></div>}</>;
}

const REQUIRED = ['Transfer Certificate', 'Birth Certificate', 'Application Form'], OPTIONAL = ['Community Certificate', 'Aadhaar Card'];
const docLabel = s => (s === 'REJECTED' ? 'NOT VERIFIED' : s);

function FilePreview({ path }) {
  const [pv, setPv] = useState(null);
  useEffect(() => { let u; setPv(null); fileBlob(path).then(b => { u = URL.createObjectURL(b); setPv({ url: u, type: b.type }); }).catch(e => setPv({ error: e.message })); return () => u && URL.revokeObjectURL(u); }, [path]);
  if (!pv) return <p>Loading…</p>;
  if (pv.error) return <p className="err">{pv.error}</p>;
  return pv.type.startsWith('image') ? <img src={pv.url} alt="Document" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
    : <iframe src={pv.url} title="Document" style={{ width: '100%', height: 440, border: '1px solid var(--line)', borderRadius: 10 }} />;
}

function DocPopup({ s, onClose, onChanged }) {
  const [target, setTarget] = useState(null), fileRef = useRef(null);
  const [docs, setDocs] = useState([]), [type, setType] = useState(REQUIRED[0]), [file, setFile] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [n, setN] = useState(0);
  useEffect(() => { api(`/documents?studentId=${s.id}`).then(setDocs).catch(e => setErr(e.message)); }, [n]);
  const latest = t => docs.find(d => d.docType === t), ok = t => latest(t) && latest(t).status !== 'REJECTED';
  const submitted = REQUIRED.filter(ok).length, locked = REQUIRED.every(ok);
  const editable = d => d && (d.status === 'REJECTED' || (d.status === 'PENDING' && !locked));                                                                  
  useEffect(() => { const miss = REQUIRED.find(t => !ok(t)); if (miss) setType(miss); }, [docs]);
  const upload = async () => {
    try { if (!file) throw new Error('Choose a file to upload'); setBusy(true);
      await api('/documents', { method: 'POST', body: { studentId: s.id, docType: type, fileName: file.name, fileData: await b64(file) } });
      setFile(null); setErr(''); setN(x => x + 1); onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const replace = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !target) return;
    try { setBusy(true); await api(`/documents/${target.id}/replace`, { method: 'POST', body: { fileName: f.name, fileData: await b64(f) } }); setErr(''); setN(x => x + 1); onChanged(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); setTarget(null); }
  };
  const view = d => <><button onClick={() => openFile(`/documents/${d.id}/file`).catch(e => setErr(e.message))}>View</button>
    {editable(d) && <> <button disabled={busy} onClick={() => { setTarget(d); fileRef.current.click(); }}>{d.status === 'REJECTED' ? 'Resubmit' : 'Replace'}</button></>}</>;
  return <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel" onClick={e => e.stopPropagation()}>
    <h3>{s.name} · Documents</h3>
    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={replace} />
    <table><tbody>{[['Reg no', s.regno], ['Class', s.classLevel], ['Gender / Medium', `${s.gender} / ${s.medium}`], ['Community', s.community], ['District', s.district]].map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
    <h4>Required documents · {submitted} of {REQUIRED.length} submitted</h4>
    <div className="bar" style={{ marginBottom: 10 }}><i className="f2" style={{ width: `${(100 * submitted) / REQUIRED.length}%` }} /></div>
    {locked && <p style={{ color: 'var(--mute)', margin: '0 0 8px' }}>Submitted for verification. Editing is locked.</p>}
    <table><tbody>{REQUIRED.map(t => { const d = latest(t); return <tr key={t}><td>{t}</td><td>{d ? <span className={`badge ${d.status}`}>{docLabel(d.status)}</span> : <span className="badge">MISSING</span>}</td><td>{d?.remarks || ''}</td><td>{d && view(d)}</td></tr>; })}</tbody></table>
    {docs.some(d => OPTIONAL.includes(d.docType)) && <><h4>Other documents</h4><table><tbody>{docs.filter(d => OPTIONAL.includes(d.docType)).map(d => <tr key={d.id}><td>{d.docType}</td><td><span className={`badge ${d.status}`}>{docLabel(d.status)}</span></td><td>{d.remarks || ''}</td><td>{view(d)}</td></tr>)}</tbody></table></>}
    <h4>Upload</h4>
    <div className="row2"><select value={type} onChange={e => setType(e.target.value)}><optgroup label="Required">{REQUIRED.map(t => <option key={t}>{t}</option>)}</optgroup><optgroup label="Optional">{OPTIONAL.map(t => <option key={t}>{t}</option>)}</optgroup></select>
      <input key={n} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files[0])} /></div>
    {err && <p className="err">{err}</p>}
    <div className="row2"><button className="pri" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload document'}</button><button onClick={onClose}>Close</button></div></div></div>;
}

function StudentDocsDialog({ s, user, onClose, onChanged }) {
  const [st, setSt] = useState(null), [docs, setDocs] = useState([]), [rm, setRm] = useState(''), [err, setErr] = useState(''), [n, setN] = useState(0);
  useEffect(() => { api(`/students/${s.studentId}`).then(setSt).catch(e => setErr(e.message)); }, []);
  useEffect(() => { api(`/documents?studentId=${s.studentId}`).then(setDocs).catch(e => setErr(e.message)); }, [n]);
  const latest = t => docs.find(d => d.docType === t), isAdmin = user.role === 'SUPER_ADMIN';
  const missing = REQUIRED.filter(t => !(latest(t) && latest(t).status !== 'REJECTED')), pending = docs.filter(d => d.status === 'PENDING');
  const review = (d, decision, remarks = '') => api(`/documents/${d.id}/review`, { method: 'POST', body: { decision, remarks } });
  const act = async fn => { try { await fn(); setErr(''); setRm(''); } catch (e) { setErr(e.message); } setN(x => x + 1); onChanged(); };
  const rowsList = [...REQUIRED.map(t => [t, latest(t)]), ...docs.filter(d => OPTIONAL.includes(d.docType)).map(d => [d.docType, d])];
  const sm = { padding: '5px 12px', fontSize: 12 };
  const details = st ? [['Reg no', st.regno], ['EMIS no', st.emisNo], ['Class', st.classLevel], ['Gender / Medium', `${st.gender} / ${st.medium}`], ['Community', st.community + (st.disability ? ' (PWD)' : '')],
    ['District / Region', `${st.district} / ${st.regionalCentre}`], ['School', st.schoolName || '—'], ['Merit (total / rank)', `${st.total} / ${st.orank}`], ['Seat category', st.selectedCategory || '—'], ['Phone', st.phone || '—'], ['Status', st.admitStatus || st.selectStatus]] : [];
  return <div className="modal" role="dialog" aria-modal="true" onClick={onClose}><div className="panel" style={{ width: 1000, maxWidth: '96vw' }} onClick={e => e.stopPropagation()}>
    <h3>{s.name} <span className={`badge ${s.state}`}>{docLabel(s.state)}</span></h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 24 }}>
      <div><h4 style={{ marginTop: 0 }}>Student details</h4>
        {st ? <table><tbody>{details.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table> : <p>Loading…</p>}</div>
      <div><h4 style={{ marginTop: 0 }}>Documents · {REQUIRED.length - missing.length} of {REQUIRED.length} required submitted</h4>
        <table><tbody>{rowsList.map(([t, d]) => <tr key={d ? d.id : t}>
          <td>{d ? <a href="#" onClick={e => { e.preventDefault(); openFile(`/documents/${d.id}/file`).catch(x => setErr(x.message)); }}>{t}</a> : t}
            {d && <><br /><small style={{ color: 'var(--mute)' }}>{d.fileName}</small></>}{d?.remarks && <><br /><small className="err">{d.remarks}</small></>}</td>
          <td>{d ? <span className={`badge ${d.status}`}>{docLabel(d.status)}</span> : <span className="badge">MISSING</span>}</td>
          </tr>)}</tbody></table>
        {isAdmin && pending.length > 0 && <><textarea rows="3" style={{ width: '100%', marginTop: 12 }} aria-label="Message (required for Not Verified)" value={rm} onChange={e => setRm(e.target.value)} />
          <div className="row2"><button className="pri" disabled={missing.length > 0} onClick={() => act(async () => { for (const d of pending) await review(d, 'VERIFIED', rm); })}>Verify</button>
            <button className="bad" onClick={() => act(async () => { for (const d of pending) await review(d, 'REJECTED', rm); })}>Not Verified</button></div></>}
        {missing.length > 0 && <p className="err">Missing: {missing.join(', ')}</p>}
        {err && <p className="err">{err}</p>}</div></div>
    <div className="row2"><button onClick={onClose}>Close</button></div></div></div>;
}

function DocVerification({ user }) {
  const isDistrict = user.role === 'DISTRICT';
  const [tab, setTab] = useState(isDistrict ? 'UPLOAD' : 'PENDING'), [rows, setRows] = useState([]), [err, setErr] = useState(''), [n, setN] = useState(0), [pick, setPick] = useState(null), [open, setOpen] = useState(null), [prog, setProg] = useState({});
  useEffect(() => { api('/documents/progress').then(setProg).catch(() => {}); }, [n]);
  useEffect(() => { if (tab === 'UPLOAD') return; let stale = false; api(`/documents/students?status=${tab}`).then(r => !stale && (setRows(r), setErr(''))).catch(e => !stale && setErr(e.message)); return () => { stale = true; }; }, [tab, n]);
  return <>
    <div className="head"><h1>Document Verification</h1></div>
    <div className="tabs">{[...(isDistrict ? [['UPLOAD', 'Upload documents']] : []), ['PENDING', 'Pending'], ['VERIFIED', 'Verified'], ['REJECTED', 'Not Verified']].map(([k, l]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'UPLOAD' ? <AdmittedPicker onPick={setPick} progress={prog} docsOpen /> : <div className="panel">{err && <p className="err">{err}</p>}
      <table><thead><tr><th>Reg no</th><th>Name</th><th>Class</th><th>District</th><th>Submitted</th><th>Verified</th><th>Pending</th><th>Last upload</th><th>Status</th></tr></thead>
        <tbody>{rows.map(r => <tr className="row" key={r.studentId} onClick={() => setOpen(r)}><td>{r.regno}</td><td>{r.name}</td><td>{r.classLevel}</td><td>{r.district}</td>
          <td>{r.submitted}/{REQUIRED.length}</td><td>{r.verified}/{REQUIRED.length}</td><td>{r.pending}</td><td>{new Date(r.lastUploadedAt).toLocaleDateString()}</td>
          <td><span className={`badge ${r.state}`}>{docLabel(r.state)}</span></td></tr>)}</tbody></table>
      {!rows.length && <p style={{ color: 'var(--mute)' }}>No students.</p>}</div>}
    {open && <StudentDocsDialog s={open} user={user} onClose={() => setOpen(null)} onChanged={() => setN(x => x + 1)} />}
    {pick && <DocPopup s={pick} onClose={() => setPick(null)} onChanged={() => setN(x => x + 1)} />}</>;
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
  const [user, setUser] = useState(savedUser), [page, setPage] = useState('dash'), [pw, setPw] = useState(false), [mobileOpen, setMobileOpen] = useState(false), [pendingResets, setPendingResets] = useState(0);
  useEffect(() => { const h = e => { if (e.key === 'Escape') { document.querySelector('.modal')?.click(); setMobileOpen(false); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const pageNames = { dash: 'Dashboard', students: 'Student Details', seats: 'Vacancy Management', docs: 'Document Verification', tc: 'Transfer Certificate Requests', import: 'Import Data', logs: 'Audit Logs', users: 'Users & Access', resets: 'Password Requests' };
  useEffect(() => { document.title = `${user ? (pageNames[page] || 'Admission Portal') : 'Sign in'} · School Admissions Portal`; }, [page, user]);
  // Re-check the session when the person returns to the tab. There is deliberately no timer that pings the server
  // in the background: that would keep an unattended session alive forever. IdleGuard keeps it alive only while
  // the person is actually working, and signs them out when they are not.
  useEffect(() => {
    if (!user) return;
    const vis = () => document.visibilityState === 'visible' && api('/auth/session').catch(() => {});
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [user]);
  // Count of password requests waiting for the super admin (fetched on sign-in and when changing page; no background polling).
  useEffect(() => { if (user?.role === 'SUPER_ADMIN') api('/password-resets').then(r => setPendingResets(r.pending)).catch(() => {}); }, [user, page]);
  if (!user) return <Login onLogin={setUser} />;
  const Nav = ({ k, icon, label, badge }) => <button className={`nav ${page === k ? 'on' : ''}`} aria-current={page === k ? 'page' : undefined} onClick={() => { setPage(k); setMobileOpen(false); }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={IC[icon]} /></svg><span>{label}</span>{badge > 0 && <em className="nav-badge" aria-label={`${badge} waiting`}>{badge}</em>}
  </button>;
  const logout = (reason) => { if (typeof reason === 'string' && reason) setLogoutReason(reason); api('/auth/logout', { method: 'POST' }).catch(() => {}).finally(() => { setToken(null); setUser(null); if (typeof reason === 'string' && reason) window.location.reload(); }); };
  return <div className={`shell ${mobileOpen ? 'menu-open' : ''}`}>
    <button className="side-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
    <aside className="side" aria-label="Main navigation">
      <div className="brand"><img src="/emblem.png" alt="Government of Tamil Nadu emblem" /><div><strong>Admissions Portal</strong><small>Government of Tamil Nadu</small></div></div>
      <div className="nav-caption">WORKSPACE</div>
      <Nav k="dash" icon="seat" label="Dashboard" />
      <Nav k="students" icon="users" label="Student Details" />
      {user.role !== 'STATE' && <><div className="nav-caption">ADMISSION OPERATIONS</div><Nav k="seats" icon="seat" label="Vacancy Management" /><Nav k="docs" icon="ok" label="Document Verification" /></>}
      <Nav k="tc" icon="doc" label="TC Requests" />
      {user.role === 'SUPER_ADMIN' && <><div className="nav-caption">ADMINISTRATION</div><Nav k="import" icon="up" label="Import Data" /><Nav k="logs" icon="log" label="Audit Logs" /><Nav k="users" icon="users" label="Users & Access" /><Nav k="resets" icon="lock" label="Password Requests" badge={pendingResets} /></>}
      <div className="side-spacer" />
      <div className="side-security"><span className="security-dot" /> Secure administrative workspace</div>
      <div className="me"><div className="av">{(user.username || 'U')[0]}</div><div className="me-copy"><strong>{user.username}</strong><small>{user.role === 'STATE' ? 'STATE COORDINATOR' : user.role.replaceAll('_', ' ')}</small></div></div>
      <div className="acct"><button className="acct-btn" onClick={() => setPw(true)}>Change password</button><button className="acct-btn out" onClick={() => logout()}>Sign out</button></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button className="menu-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span></span><span></span><span></span></button><div><div className="eyebrow">ADMISSION MANAGEMENT SYSTEM</div><div className="topbar-title">{pageNames[page] || 'Admission Portal'}</div></div></div>
        <div className="topbar-right"><div className="scope-chip session-chip" title={`Sessions end after ${IDLE_MINUTES} minutes of inactivity`}><span className="scope-dot"></span>Secure session</div><div className="scope-chip"><span className="scope-dot"></span>{['SUPER_ADMIN', 'STATE'].includes(user.role) ? 'All regions' : (user.region || user.district || 'Assigned region')}</div><div className="topbar-user"><div className="topbar-avatar">{(user.username || 'U')[0]}</div><div><strong>{user.username}</strong><small>{user.role === 'STATE' ? 'State Coordinator' : user.role.replaceAll('_', ' ')}</small></div></div></div>
      </header>
      <OfflineBanner /><div className="page-content">
        {page === 'dash' ? <Dashboard user={user} /> : page === 'docs' && user.role !== 'STATE' ? <DocVerification user={user} /> : page === 'seats' && user.role !== 'STATE' ? <SeatList user={user} /> : page === 'tc' ? <TcRequests user={user} />
          : page === 'import' && user.role === 'SUPER_ADMIN' ? <ImportData /> : page === 'logs' && user.role === 'SUPER_ADMIN' ? <Logs /> : page === 'users' && user.role === 'SUPER_ADMIN' ? <UsersPage me={user} /> : page === 'resets' && user.role === 'SUPER_ADMIN' ? <PasswordRequests onCount={setPendingResets} /> : <StudentDetails user={user} />}
      </div>
      <footer className="app-footer"><span>Government of Tamil Nadu · Admission Management System</span><span>Authorised access only</span></footer>
    </main>
    {pw && <ChangePassword username={user.username} onClose={() => setPw(false)} />}
    <IdleGuard onExpire={logout} />
  </div>;
}
