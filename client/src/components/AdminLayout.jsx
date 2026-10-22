import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import load from '../utils/load';
import Icon from './Icon';
import GlobalSearch from './GlobalSearch';
import useOutside from '../hooks/useOutside';

// Every link points at a working page; Settings shows admin management only to the owner.
const nav = [
  { to: '/admin', end: true, label: 'Dashboard', icon: 'home' },
  { label: 'Manage Quizzes', icon: 'quiz', base: '/admin/papers', children: [
    { to: '/admin/papers', end: true, label: 'All quizzes' },
    { to: '/admin/papers/new', label: 'Create quiz' }
  ] },
  { to: '/admin/students', label: 'Students', icon: 'students' },
  { to: '/admin/rolls', label: 'Roll & PIN Management', icon: 'key' },
  { to: '/admin/results', label: 'Reports', icon: 'chart' },
  { to: '/admin/schedule', label: 'Paper Schedule', icon: 'calendar' },
  { to: '/admin/retakes', label: 'Retake Requests', icon: 'retake' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' }
];

function NavGroup({ item, pathname }) {
  const inside = pathname.startsWith(item.base);
  const [open, setOpen] = useState(inside);
  useEffect(() => { if (inside) setOpen(true); }, [inside]);
  return (
    <div className={'navgroup' + (open ? ' open' : '')}>
      <button type="button" className={inside ? 'active-parent' : ''} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="icon"><Icon name={item.icon} size={20} /></span>{item.label}<Icon name="chevronRight" size={16} className="chev" />
      </button>
      {open && <div className="subnav">{item.children.map(c => <NavLink key={c.to} to={c.to} end={c.end}>{c.label}</NavLink>)}</div>}
    </div>
  );
}

export default function AdminLayout({ theme, onToggleTheme }) {
  const s = load('qr_admin', null, sessionStorage), navigate = useNavigate(), { pathname } = useLocation();
  const [open, setOpen] = useState(false), [menu, setMenu] = useState(false), prof = useRef(null);
  useOutside(prof, () => setMenu(false), menu);
  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);
  const logout = () => { sessionStorage.removeItem('qr_admin'); navigate('/'); };
  const name = (s?.email || 'admin').split('@')[0];

  return (
    <div className="admin">
      <div className={'sidebar-backdrop' + (open ? ' open' : '')} onClick={() => setOpen(false)} />
      <aside className={'sidebar' + (open ? ' open' : '')} aria-label="Admin navigation">
        <Link to="/admin" className="brand">
          <span className="mark"><Icon name="cap" size={22} /></span>
          <span><b>QuizRoom</b><small>Learn • Test • Grow</small></span>
        </Link>
        <nav className="navlist">
          {nav.map(item => item.children
            ? <NavGroup key={item.label} item={item} pathname={pathname} />
            : <NavLink key={item.to} to={item.to} end={item.end} className="navitem"><span className="icon"><Icon name={item.icon} size={20} /></span>{item.label}</NavLink>)}
          <div className="navsep" />
          <button type="button" className="navitem" onClick={logout}><span className="icon"><Icon name="logout" size={20} /></span>Log out</button>
        </nav>
        <div className="sidecard">
          <b>Fair, secure exams</b>
          <p>Questions lock after Next and the timer follows the paper's schedule, enforced on the server.</p>
        </div>
      </aside>

      <div className="admin-main">
        <div className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(o => !o)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
          <div className="grow"><GlobalSearch /></div>
          <button className="icon-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
          <div className="profile" ref={prof}>
            <button onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="avatar">{name[0]?.toUpperCase()}</span>
              <span className="who"><b>{name}</b><small>{s?.isSuper ? 'Owner' : 'Administrator'}</small></span>
              <Icon name="chevronDown" size={16} />
            </button>
            {menu && (
              <div className="popover right" role="menu">
                <div className="empty-row" style={{ paddingBottom: 6 }}><b style={{ color: 'var(--ink)' }}>{s?.email}</b><br />{s?.isSuper ? 'Owner' : 'Administrator'}</div>
                <Link to="/admin/settings" role="menuitem"><Icon name="settings" size={16} />Account settings</Link>
                <button className="item" role="menuitem" onClick={logout}><Icon name="logout" size={16} />Log out</button>
              </div>
            )}
          </div>
        </div>
        <div className="admin-content"><Outlet context={{ theme, onToggleTheme }} /></div>
      </div>
    </div>
  );
}
