import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import PasswordField from '../components/PasswordField';

export default function StudentLogin() {
  const navigate = useNavigate(), [sp] = useSearchParams(), location = useLocation();
  const [rollNumber, setRollNumber] = useState(''), [password, setPassword] = useState('');
  const [msg, setMsg] = useState(() => {
    const m = load('qr_student_msg', '', sessionStorage);
    sessionStorage.removeItem('qr_student_msg');
    return m || location.state?.msg || '';
  }), [busy, setBusy] = useState(false);

  if (load('qr_student', null, sessionStorage)) return <Navigate to={sp.get('next') || '/'} replace />;

  const login = async () => {
    setBusy(true); setMsg('');
    try {
      save('qr_student', await api('/students/login', { method: 'POST', body: { rollNumber, password } }), sessionStorage);
      navigate(sp.get('next') || '/');
    } catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="card">
      <h1>Student login</h1>
      <input type="text" placeholder="Roll number" value={rollNumber} onChange={e => setRollNumber(e.target.value)} />
      <PasswordField placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && login()} autoComplete="current-password" />
      <div className="row"><button onClick={login} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button><Link className="btn ghost" to="/">Back</Link></div>
      <p className="muted msg">First time? <Link to={'/student-register' + (sp.get('next') ? '?next=' + encodeURIComponent(sp.get('next')) : '')}>Register here</Link></p>
      <p className="err msg" role="alert">{msg}</p>
    </div>
  );
}
