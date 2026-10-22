import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import PasswordField from '../components/PasswordField';
import AuthLayout, { Alert } from '../components/AuthLayout';
import Icon from '../components/Icon';
export default function AdminLogin() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  if (load('qr_admin', null, sessionStorage)) return <Navigate to="/admin" replace />;
  const login = async e => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setMsg('');
    try { save('qr_admin', await api('/admin/login', { method: 'POST', body: { email, password } }), sessionStorage); navigate('/admin'); }
    catch (err) { setMsg(err.message); setBusy(false); }
  };
  return (
    <AuthLayout icon="shield" title="Admin login" subtitle="Manage papers, students and results."
      points={['Create timed, scheduled MCQ papers', 'Authorize students with roll numbers & PINs', 'Track results, ranks and retakes']}>
      <form onSubmit={login} noValidate>
        <Alert>{msg}</Alert>
        <label className="field" htmlFor="al-email">Email</label>
        <input id="al-email" type="email" placeholder="admin@school.edu" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
        <label className="field" htmlFor="al-pass">Password</label>
        <PasswordField id="al-pass" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        <button type="submit" className="block" disabled={busy}>{busy ? <><span className="spinner" />Logging in…</> : <>Log in<Icon name="chevronRight" size={16} /></>}</button>
        <Link className="btn ghost block" to="/" style={{ marginTop: 10 }}>Back to home</Link>
      </form>
    </AuthLayout>
  );
}
