import { useEffect, useState } from 'react';
import { serverReachable } from '../api/index.js';

// The browser's navigator.onLine / "offline" event is only a hint (it is often wrong behind proxies, VPNs
// and on flaky Wi-Fi), so the banner is shown only after the API itself fails to answer /api/health.
export default function OfflineBanner() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    let alive = true, timer;
    const check = async () => {
      const ok = await serverReachable();
      if (!alive) return;
      setOff(!ok);
      clearTimeout(timer);
      if (!ok) timer = setTimeout(check, 15000); // keep re-checking until the connection returns
    };
    const hint = () => { if (navigator.onLine === false) check(); };
    const on = () => { clearTimeout(timer); check(); };
    window.addEventListener('online', on); window.addEventListener('offline', check);
    hint();
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('online', on); window.removeEventListener('offline', check); };
  }, []);
  return off ? <div className="offline-banner" role="status">You are offline. Changes cannot be saved until the connection returns.</div> : null;
}
