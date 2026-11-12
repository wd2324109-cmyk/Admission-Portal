// Security and resilience helpers used by the shell: idle sign-out, offline notice, error boundary,
// password strength guidance and a caps-lock hint. None of them change what the backend enforces;
// they make the secure behaviour visible and keep the browser side tidy.
import { Component, useEffect, useRef, useState } from 'react';
import { api, lastApiCall } from './api.js';

// Keep this in step with SESSION_IDLE_MINUTES on the server (default 30).
export const IDLE_MINUTES = Math.max(2, +import.meta.env.VITE_IDLE_MINUTES || 30);
const LIMIT = IDLE_MINUTES * 60 * 1000, WARN = Math.min(2 * 60 * 1000, LIMIT / 2);

const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Signs the person out after a period without any activity. Two minutes before that, a dialog offers
// to stay signed in. While the person is working, a quiet request keeps the server session alive.
export function IdleGuard({ onExpire }) {
  const [left, setLeft] = useState(null), last = useRef(Date.now()), warned = useRef(false), expire = useRef(onExpire), stay = useRef(null);
  expire.current = onExpire;
  useEffect(() => {
    const bump = () => { if (!warned.current) last.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, bump, { passive: true, capture: true }));
    const timer = setInterval(() => {
      const now = Date.now(), idle = now - last.current;
      if (idle >= LIMIT) return expire.current(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`);
      if (idle >= LIMIT - WARN) { warned.current = true; return setLeft(Math.max(1, Math.ceil((LIMIT - idle) / 1000))); }
      if (idle < 60000 && now - lastApiCall() > LIMIT / 3) api('/auth/session').catch(() => {});
    }, 1000);
    return () => { clearInterval(timer); events.forEach(e => window.removeEventListener(e, bump, { capture: true })); };
  }, []);
  useEffect(() => { if (left !== null) stay.current?.focus(); }, [left === null]);
  const keep = () => api('/auth/session').then(() => { last.current = Date.now(); warned.current = false; setLeft(null); }).catch(() => {});
  if (left === null) return null;
  return <div className="modal idle-modal" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-body"><div className="panel" style={{ width: 430 }}>
    <h3 id="idle-title">Are you still there?</h3>
    <p id="idle-body">For your security, this session will end in <b className="idle-count" aria-live="polite">{fmt(left)}</b> because there has been no activity.</p>
    <div className="row2"><button ref={stay} className="pri" onClick={keep}>Stay signed in</button><button onClick={() => expire.current('You signed out.')}>Sign out now</button></div>
  </div></div>;
}

export function OfflineBanner() {
  const [off, setOff] = useState(() => navigator.onLine === false);
  useEffect(() => {
    const on = () => setOff(false), out = () => setOff(true);
    window.addEventListener('online', on); window.addEventListener('offline', out);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', out); };
  }, []);
  return off ? <div className="offline-banner" role="status">You are offline. Changes cannot be saved until the connection returns.</div> : null;
}

// A rendering error should never leave a blank page or show internals to the user.
export class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* intentionally silent: no stack traces in the browser console of a public build */ }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="nf"><div><div className="code" aria-hidden="true">!</div><h1>Something went wrong</h1>
      <p>The page could not be displayed. Your data is safe. Reload to continue; if this keeps happening, contact the administrator.</p>
      <button className="pri" onClick={() => window.location.reload()}>Reload the portal</button></div></main>;
  }
}

// Mirrors the server's rules (10 to 72 bytes, must not contain the username) and adds advisory strength hints.
export const passwordChecks = (pw = '', username = '') => {
  const p = String(pw), bytes = new TextEncoder().encode(p).length;
  return [
    { ok: p.length >= 10, label: 'At least 10 characters', required: true },
    { ok: bytes <= 72, label: 'No longer than 72 bytes', required: true },
    { ok: !username || !p.toLowerCase().includes(String(username).toLowerCase()), label: 'Does not contain your username', required: true },
    { ok: /[a-z]/.test(p) && /[A-Z]/.test(p), label: 'Upper and lower case letters' },
    { ok: /\d/.test(p), label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(p), label: 'A symbol' },
    { ok: p.length >= 14, label: '14 or more characters (recommended)' },
  ];
};
export const passwordAcceptable = (pw, username) => passwordChecks(pw, username).filter(c => c.required).every(c => c.ok);

export function PasswordMeter({ value, username }) {
  if (!value) return null;
  const checks = passwordChecks(value, username), met = checks.filter(c => c.ok).length;
  const level = !passwordAcceptable(value, username) ? 0 : met >= 7 ? 3 : met >= 5 ? 2 : 1;
  const names = ['Not accepted yet', 'Acceptable', 'Good', 'Strong'];
  return <div className="pw-meter" aria-live="polite">
    <div className={`pw-bars l${level}`} aria-hidden="true"><i /><i /><i /></div>
    <div className="pw-label">Password strength: <b>{names[level]}</b></div>
    <ul className="pw-rules">{checks.map(c => <li key={c.label} className={c.ok ? 'ok' : c.required ? 'req' : ''}><span aria-hidden="true">{c.ok ? '✓' : '○'}</span>{c.label}</li>)}</ul>
  </div>;
}

// Warns when Caps Lock is on while typing a password.
export function useCapsLock() {
  const [on, setOn] = useState(false);
  const handlers = { onKeyDown: e => setOn(!!e.getModifierState?.('CapsLock')), onKeyUp: e => setOn(!!e.getModifierState?.('CapsLock')), onBlur: () => setOn(false) };
  return [on, handlers];
}
export const CapsHint = ({ on }) => (on ? <small className="caps-hint" role="status">Caps Lock is on</small> : null);
