import { ROLE_NAME, scopeOf, displayName } from '../lib/status.js';

export default function Topbar({ user, route, menuOpen, onMenu }) {
  return <header className="topbar">
    <div className="topbar__left">
      <button type="button" className="menu-toggle" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={onMenu}><span /><span /><span /></button>
      <nav className="crumbs" aria-label="Breadcrumb"><span>Admission Management System</span><span aria-hidden="true">/</span><span>{route.section}</span><span aria-hidden="true">/</span><b aria-current="page">{route.label}</b></nav>
      <b className="crumbs-short">{route.label}</b>
    </div>
    <div className="topbar__right">
      <div className="scope-chip"><span className="status-dot" aria-hidden="true" />{scopeOf(user)}</div>
      <div className="topbar__user"><div className="avatar avatar--sm" aria-hidden="true">{(displayName(user) || 'U')[0]}</div><div><strong>{displayName(user)}</strong><small>{ROLE_NAME[user.role] || user.role}</small></div></div>
    </div>
  </header>;
}
