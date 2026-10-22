import { useNavigate, useOutletContext } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/Icon';
import load from '../../utils/load';
import Admins from './Admins';

export default function Settings() {
  const s = load('qr_admin', null, sessionStorage), navigate = useNavigate();
  const { theme, onToggleTheme } = useOutletContext();
  const logout = () => { sessionStorage.removeItem('qr_admin'); navigate('/'); };
  return (<>
    <PageHeader title="Settings" subtitle="Your account, appearance and admin access." />
    <div className="grid cols-2" style={{ marginBottom: 16 }}>
      <div className="card" style={{ margin: 0 }}>
        <div className="card-head"><h2><span className="hicon"><Icon name="user" size={16} /></span>Account</h2></div>
        <dl className="kv">
          <dt>Email</dt><dd>{s?.email}</dd>
          <dt>Role</dt><dd>{s?.isSuper ? 'Owner' : 'Administrator'}</dd>
          <dt>Session</dt><dd>Ends when you log out or close this tab</dd>
        </dl>
        <button className="ghost" style={{ marginTop: 16 }} onClick={logout}><Icon name="logout" size={16} />Log out</button>
      </div>
      <div className="card" style={{ margin: 0 }}>
        <div className="card-head"><h2><span className="hicon"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} /></span>Appearance</h2></div>
        <p className="muted" style={{ marginTop: 0 }}>Currently using the <b>{theme}</b> theme. Saved on this device.</p>
        <button className="outline" onClick={onToggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />Switch to {theme === 'dark' ? 'light' : 'dark'} mode</button>
      </div>
    </div>
    {s?.isSuper
      ? <Admins />
      : <div className="card"><div className="card-head"><h2><span className="hicon"><Icon name="shield" size={16} /></span>Admins</h2></div><p className="muted" style={{ margin: 0 }}>Only the owner can add or remove admins.</p></div>}
  </>);
}
