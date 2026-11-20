import { useEffect, useRef, useState } from 'react';
import { api, lastApiCall } from '../api/index.js';
import { Modal } from '../components/ui/index.js';

// Keep this in step with SESSION_IDLE_MINUTES on the server (default 30).
export const IDLE_MINUTES = Math.max(2, +import.meta.env.VITE_IDLE_MINUTES || 30);
const LIMIT = IDLE_MINUTES * 60 * 1000, WARN = Math.min(2 * 60 * 1000, LIMIT / 2);
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Signs the person out after a period without any activity. Two minutes before that, a dialog offers
// to stay signed in. While the person is working, a quiet request keeps the server session alive.
export default function IdleGuard({ onExpire }) {
  const [left, setLeft] = useState(null), last = useRef(Date.now()), warned = useRef(false), done = useRef(false), expire = useRef(onExpire);
  expire.current = onExpire;
  // The timer ticks every second; a slow sign-out request must not trigger a second, third… sign-out.
  const finish = msg => { if (done.current) return; done.current = true; expire.current(msg); };

  useEffect(() => {
    const bump = () => { if (!warned.current) last.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, bump, { passive: true, capture: true }));
    const timer = setInterval(() => {
      const now = Date.now(), idle = now - last.current;
      if (idle >= LIMIT) return finish(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`);
      if (idle >= LIMIT - WARN) { warned.current = true; return setLeft(Math.max(1, Math.ceil((LIMIT - idle) / 1000))); }
      if (idle < 60000 && now - lastApiCall() > LIMIT / 3) api('/auth/session').catch(() => {});
    }, 1000);
    return () => { clearInterval(timer); events.forEach(e => window.removeEventListener(e, bump, { capture: true })); };
  }, []);

  const keep = () => api('/auth/session').then(() => { last.current = Date.now(); warned.current = false; setLeft(null); }).catch(() => {});
  if (left === null) return null;
  return <Modal className="modal--top" title="Are you still there?" role="alertdialog" dismissable={false} width={440} describedBy="idle-body"
    footer={<>
      <button type="button" className="btn" onClick={() => finish('You signed out.')}>Sign out now</button>
      <button type="button" className="btn btn--primary" autoFocus onClick={keep}>Stay signed in</button>
    </>}>
    <p id="idle-body">For your security, this session will end in <b className="idle-count" aria-live="polite">{fmt(left)}</b> because there has been no activity.</p>
  </Modal>;
}
