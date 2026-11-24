import { useEffect, useState } from 'react';
import { api, setToken, savedUser, setLogoutReason } from '../api/index.js';
import { IdleGuard, OfflineBanner } from '../security/index.js';
import Login from '../features/auth/Login.jsx';
import ChangePassword from '../features/auth/ChangePassword.jsx';
import { visibleRoutes } from './routes.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function App() {
  const [user, setUser] = useState(savedUser), [page, setPage] = useState('dash'), [pwOpen, setPwOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const routes = user ? visibleRoutes(user) : [];
  const route = routes.find(r => r.key === page) || routes[0];

  useEffect(() => { document.title = `${user && route ? route.label : 'Sign in'} · School Admissions Portal`; }, [user, route]);

  useEffect(() => {
    if (!menuOpen) return;
    const h = e => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [menuOpen]);

  useEffect(() => {
    if (!user) return;
    const vis = () => document.visibilityState === 'visible' && api('/auth/session').catch(() => {});
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [user]);

  const signedIn = u => { setPage('dash'); setUser(u); };
  const logout = reason => {
    const msg = typeof reason === 'string' ? reason : '';
    if (msg) setLogoutReason(msg);
    api('/auth/logout', { method: 'POST' }).catch(() => {}).finally(() => { setToken(null); setUser(null); setPage('dash'); if (msg) window.location.reload(); });
  };
  const navigate = key => { setPage(key); setMenuOpen(false); window.scrollTo(0, 0); };

  if (!user) return <Login onLogin={signedIn} />;
  return <div className={`shell ${menuOpen ? 'shell--menu-open' : ''}`}>
    <button type="button" className="scrim" tabIndex={-1} aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
    <Sidebar user={user} routes={routes} page={route.key} onNavigate={navigate} onChangePassword={() => { setMenuOpen(false); setPwOpen(true); }} onLogout={logout} />
    <div className="main">
      <Topbar user={user} route={route} menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} />
      <OfflineBanner />
      <main className="page" key={route.key}>{route.render(user, navigate)}</main>
      <footer className="footer"><span>Government of Tamil Nadu · Admission Management System</span><span>Authorised access only</span></footer>
    </div>
    {pwOpen && <ChangePassword username={user.username} onClose={() => setPwOpen(false)} />}
    <IdleGuard onExpire={logout} />
  </div>;
}
