import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import load from '../utils/load';

const icon = {
  dashboard: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  papers: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>,
  results: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V10M12 19V5M20 19v-7" /></svg>,
  students: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6M16.5 8.2a3 3 0 1 1 3 3M16 14c2.6.3 4.4 1.9 4.9 5" /></svg>,
  admins: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 4 6v6c0 4.4 3.4 7.6 8 9 4.6-1.4 8-4.6 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  menu: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
};

const links = [
  { to: '/admin', end: true, label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/papers', label: 'Papers', icon: 'papers' },
  { to: '/admin/results', label: 'Results', icon: 'results' },
  { to: '/admin/rolls', label: 'Students', icon: 'students' }
];

export default function AdminLayout() {
  const s = load('qr_admin', null, sessionStorage), navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const logout = () => { sessionStorage.removeItem('qr_admin'); navigate('/'); };

  return (
    <div className="shell">
      {open && <div className="sidebar-backdrop open" onClick={() => setOpen(false)} />}
      <nav className={'sidebar' + (open ? ' open' : '')} onClick={() => setOpen(false)}>
        <h3 style={{ padding: '6px 12px' }}>Admin panel</h3>
        {links.map(l => (
          <NavLink key={l.to} to={l.to} end={l.end}><span className="icon">{icon[l.icon]}</span>{l.label}</NavLink>
        ))}
        {s.isSuper && <NavLink to="/admin/admins"><span className="icon">{icon.admins}</span>Admins</NavLink>}
      </nav>
      <div className="shell-main">
        <div className="topbar">
          <button className="menu-btn ghost small" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">{icon.menu}</button>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <span className="muted">{s.email}</span>
            <button className="ghost small" onClick={logout}>Log out</button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
