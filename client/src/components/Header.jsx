import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import load from '../utils/load';
import Icon from './Icon';

// Public / student navbar. Login state comes from the same sessionStorage keys the route guards use.
// During an exam (/test) it shrinks to logo + theme so nothing tempts the student to navigate away.
export default function Header({ theme, onToggleTheme }) {
  const { pathname, hash } = useLocation(), navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname, hash]);
  const student = load('qr_student', null, sessionStorage), admin = load('qr_admin', null, sessionStorage);
  const exam = pathname === '/test';
  const logout = () => { sessionStorage.removeItem('qr_student'); navigate('/'); };
  const themeBtn = (
    <button className="icon-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );

  return (
    <header className="pnav">
      <div className="pnav-in">
        <Link to="/" className="brand" aria-label="QuizRoom home">
          <span className="mark"><Icon name="cap" size={20} /></span>
          <span><b>QuizRoom</b><small>Learn • Test • Grow</small></span>
        </Link>
        {exam ? <div className="pnav-actions">{themeBtn}</div> : (<>
          <nav className={'pnav-links' + (open ? ' open' : '')} aria-label="Main">
            <NavLink to="/" end>Home</NavLink>
            {pathname === '/' && <a href="#features">Features</a>}
            {pathname === '/' && <a href="#how">How it works</a>}
            {student ? <NavLink to="/dashboard">My dashboard</NavLink> : <NavLink to="/student-login">Student login</NavLink>}
            <NavLink to={admin ? '/admin' : '/admin-login'}>{admin ? 'Admin panel' : 'Admin'}</NavLink>
            <div className="pnav-mobile-cta">
              {student
                ? <button className="ghost" onClick={logout}><Icon name="logout" size={16} />Log out</button>
                : <Link className="btn" to="/student-register">Register</Link>}
            </div>
          </nav>
          <div className="pnav-actions">
            {themeBtn}
            {student
              ? <button className="ghost small hide-sm" onClick={logout}><Icon name="logout" size={16} />Log out</button>
              : <Link className="btn small hide-sm" to="/student-register">Register</Link>}
            <button className="icon-btn pnav-burger" onClick={() => setOpen(o => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
              <Icon name={open ? 'close' : 'menu'} size={20} />
            </button>
          </div>
        </>)}
      </div>
    </header>
  );
}
