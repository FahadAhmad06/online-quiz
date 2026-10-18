import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PasswordField from '../components/PasswordField';

export default function StudentRegister() {
  const [f, setF] = useState({ name: '', rollNumber: '', pin: '', password: '', confirmPassword: '' });
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const navigate = useNavigate(), [sp] = useSearchParams();
  const loginHref = '/student-login' + (sp.get('next') ? '?next=' + encodeURIComponent(sp.get('next')) : '');

  const register = async () => {
    if (!f.name.trim()) return setMsg('Enter your name.');
    if (!f.rollNumber.trim()) return setMsg('Enter your roll number.');
    if (!f.pin.trim()) return setMsg('Enter your registration PIN.');
    if (f.password.length < 6) return setMsg('Password must be at least 6 characters.');
    if (f.password !== f.confirmPassword) return setMsg('Passwords do not match.');
    setBusy(true); setMsg('');
    try {
      await api('/students/register', { method: 'POST', body: f });
      navigate(loginHref, { state: { msg: 'Registration successful. Please log in using your roll number and password.' } });
    } catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="card">
      <h1>Student registration</h1>
      <p className="muted">Ask your teacher for your roll number's registration PIN.</p>
      <input type="text" placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input type="text" placeholder="Roll number" value={f.rollNumber} onChange={e => setF({ ...f, rollNumber: e.target.value })} />
      <input type="text" placeholder="Registration PIN" value={f.pin} onChange={e => setF({ ...f, pin: e.target.value })} />
      <PasswordField placeholder="Create password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
      <PasswordField placeholder="Confirm password" value={f.confirmPassword} onChange={e => setF({ ...f, confirmPassword: e.target.value })}
        onKeyDown={e => e.key === 'Enter' && register()} autoComplete="new-password" />
      <div className="row"><button onClick={register} disabled={busy}>{busy ? 'Registering…' : 'Register'}</button><Link className="btn ghost" to="/">Back</Link></div>
      <p className="muted msg">Already registered? <Link to={loginHref}>Log in</Link></p>
      <p className="err msg" role="alert">{msg}</p>
    </div>
  );
}
