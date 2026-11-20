import { useEffect, useState } from 'react';
import { api, setToken, saveUser, peekLogoutReason, clearLogoutReason } from '../../api/index.js';
import { IDLE_MINUTES, useCapsLock, CapsHint } from '../../security/index.js';
import { Alert } from '../../components/ui/index.js';
import { asset } from '../../lib/format.js';

const EyeIcon = ({ off }) => <svg viewBox="0 0 24 24" aria-hidden="true">{off
  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></>
  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}</svg>;

// Passwords are reset by a super admin on the Users page, so there is no "forgot password" flow here.
export default function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' }), [err, setErr] = useState(peekLogoutReason), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [caps, capsKeys] = useCapsLock();
  useEffect(() => { clearLogoutReason(); }, []);

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const username = f.username.trim();
    if (!username || !f.password) return setErr('Enter your username and password.');
    try {
      setBusy(true); setErr('');
      const r = await api('/auth/login', { method: 'POST', body: { username, password: f.password } });
      setToken(r.token); saveUser(r.user); setF({ username: '', password: '' }); onLogin(r.user);
    } catch (e2) { setErr(e2.message); setF(x => ({ ...x, password: '' })); } finally { setBusy(false); }
  };

  return <main className="login">
    <aside className="login__brand">
      <img src={asset('emblem.png')} alt="Government of Tamil Nadu emblem" />
      <h1>Admission Management System</h1>
      <p>Government of Tamil Nadu</p>
      <small>Student selection, joining, transfer certificates and vacancies for Class 9 and 10.</small>
    </aside>
    <section className="login__form">
      <form className="login__card" onSubmit={submit} noValidate>
        <h2>Sign in</h2>
        <p className="login__sub">Use the username and password issued to you.</p>
        <div className="field"><label htmlFor="login-user">Username</label>
          <input id="login-user" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} autoFocus value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></div>
        <div className="field"><label htmlFor="login-pass">Password</label>
          <div className="pw">
            <input id="login-pass" type={show ? 'text' : 'password'} autoComplete="current-password" maxLength={200} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} {...capsKeys} />
            <button type="button" className="pw__eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}><EyeIcon off={show} /></button>
          </div>
          <CapsHint on={caps} /></div>
        <Alert>{err}</Alert>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="login__notice">Forgot your password? Ask the super admin for a new one. Authorised users only. Sessions end after {IDLE_MINUTES} minutes of inactivity, and signing in on another device signs you out here.</p>
      </form>
    </section>
  </main>;
}
