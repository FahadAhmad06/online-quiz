import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import load from '../utils/load';
export default function AdminLayout() {
  const s = load('qr_admin', null, sessionStorage), navigate = useNavigate();
  const logout = () => { sessionStorage.removeItem('qr_admin'); navigate('/'); };
  return (<>
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <h1 style={{ margin: 0 }}>Admin panel</h1>
      <div className="row"><span className="muted">{s.email}</span><button className="ghost small" onClick={logout}>Log out</button></div>
    </div>
    <nav className="nav">
      <NavLink end to="/admin">Dashboard</NavLink>
      <NavLink to="/admin/papers">Papers</NavLink>
      <NavLink to="/admin/results">Results</NavLink>
      <NavLink to="/admin/rolls">Students</NavLink>
      {s.isSuper && <NavLink to="/admin/admins">Admins</NavLink>}
    </nav>
    <Outlet />
  </>);
}
