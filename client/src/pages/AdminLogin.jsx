import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
export default function AdminLogin() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  if (load('qr_admin', null, sessionStorage)) return <Navigate to="/admin" replace />;
  const login = async () => {
    setBusy(true); setMsg('');
    try { save('qr_admin', await api('/admin/login', { method: 'POST', body: { email, password } }), sessionStorage); navigate('/admin'); }
    catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="card">
      <h1>Admin login</h1>
      <input type="email" placeholder="Admin email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
      <div className="row"><button onClick={login} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button><Link className="btn ghost" to="/">Back</Link></div>
      <p className="err msg">{msg}</p>
    </div>
  );
}
