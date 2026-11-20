import { Icon } from '../components/ui/index.js';
import { ROLE_NAME } from '../lib/status.js';
import { asset } from '../lib/format.js';

function NavItem({ route, active, onSelect }) {
  return <button type="button" className={`nav ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => onSelect(route.key)}>
    <Icon n={route.icon} size={18} /><span>{route.label}</span>
  </button>;
}

export default function Sidebar({ user, routes, page, onNavigate, onChangePassword, onLogout }) {
  const sections = [...new Set(routes.map(r => r.section))];
  return <aside className="sidebar" id="app-sidebar" aria-label="Main navigation">
    <div className="brand"><img src={asset('emblem.png')} alt="Government of Tamil Nadu emblem" /><div><strong>Admissions Portal</strong><small>Government of Tamil Nadu</small></div></div>
    <nav className="sidebar__nav">
      {sections.map(sec => <div className="nav-group" key={sec}>
        <div className="nav-caption">{sec}</div>
        {routes.filter(r => r.section === sec).map(r => <NavItem key={r.key} route={r} active={page === r.key} onSelect={onNavigate} />)}
      </div>)}
    </nav>
    <div className="sidebar__foot">
      <div className="side-security"><span className="status-dot" aria-hidden="true" />Secure administrative workspace</div>
      <div className="me"><div className="avatar" aria-hidden="true">{(user.username || 'U')[0]}</div><div className="me__copy"><strong title={user.username}>{user.username}</strong><small>{ROLE_NAME[user.role] || user.role}</small></div></div>
      <div className="acct"><button type="button" className="acct__btn" onClick={onChangePassword}>Change password</button><button type="button" className="acct__btn acct__btn--out" onClick={() => onLogout()}>Sign out</button></div>
    </div>
  </aside>;
}
