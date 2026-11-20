import { useState } from 'react';

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

export function useCapsLock() {
  const [on, setOn] = useState(false);
  const handlers = { onKeyDown: e => setOn(!!e.getModifierState?.('CapsLock')), onKeyUp: e => setOn(!!e.getModifierState?.('CapsLock')), onBlur: () => setOn(false) };
  return [on, handlers];
}
export const CapsHint = ({ on }) => (on ? <small className="caps-hint" role="status">Caps Lock is on</small> : null);
