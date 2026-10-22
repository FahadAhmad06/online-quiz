import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import PasswordField from '../components/PasswordField';
import AuthLayout, { Alert } from '../components/AuthLayout';
import Icon from '../components/Icon';

export default function StudentLogin() {
  const navigate = useNavigate(), [sp] = useSearchParams(), location = useLocation();
  const [rollNumber, setRollNumber] = useState(''), [password, setPassword] = useState('');
  // Session-expiry notices (api.js) are warnings; the post-registration message is a success.
  const [msg, setMsg] = useState(() => {
    const m = load('qr_student_msg', '', sessionStorage);
    sessionStorage.removeItem('qr_student_msg');
    return m ? { kind: 'warn', text: m } : location.state?.msg ? { kind: 'ok', text: location.state.msg } : null;
  }), [busy, setBusy] = useState(false);

  if (load('qr_student', null, sessionStorage)) return <Navigate to={sp.get('next') || '/dashboard'} replace />;

  const login = async e => {
    e?.preventDefault();
    if (busy) return;
    if (!rollNumber.trim() || !password) return setMsg({ kind: 'bad', text: 'Enter your roll number and password.' });
    setBusy(true); setMsg(null);
    try {
      save('qr_student', await api('/students/login', { method: 'POST', body: { rollNumber, password } }), sessionStorage);
      navigate(sp.get('next') || '/dashboard');
    } catch (err) { setMsg({ kind: 'bad', text: err.message }); setBusy(false); }
  };
  return (
    <AuthLayout icon="user" title="Student login" subtitle="Welcome back. Log in to see your papers and results."
      points={['Questions lock after Next, the same for everyone', 'Your progress is saved as you go', 'See your score as soon as you finish']}
      footer={<>First time? <Link className="link" to={'/student-register' + (sp.get('next') ? '?next=' + encodeURIComponent(sp.get('next')) : '')}>Register here</Link></>}>
      <form onSubmit={login} noValidate>
        <Alert kind={msg?.kind}>{msg?.text}</Alert>
        <label className="field" htmlFor="sl-roll">Roll number</label>
        <input id="sl-roll" type="text" placeholder="e.g. 23CS001" value={rollNumber} onChange={e => setRollNumber(e.target.value)} autoComplete="username" autoCapitalize="characters" />
        <label className="field" htmlFor="sl-pass">Password</label>
        <PasswordField id="sl-pass" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        <button type="submit" className="block" disabled={busy}>{busy ? <><span className="spinner" />Logging in…</> : <>Log in<Icon name="chevronRight" size={16} /></>}</button>
        <Link className="btn ghost block" to="/" style={{ marginTop: 10 }}>Back to home</Link>
      </form>
    </AuthLayout>
  );
}
