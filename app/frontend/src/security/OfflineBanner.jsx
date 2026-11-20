import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [off, setOff] = useState(() => navigator.onLine === false);
  useEffect(() => {
    const on = () => setOff(false), out = () => setOff(true);
    window.addEventListener('online', on); window.addEventListener('offline', out);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', out); };
  }, []);
  return off ? <div className="offline-banner" role="status">You are offline. Changes cannot be saved until the connection returns.</div> : null;
}
