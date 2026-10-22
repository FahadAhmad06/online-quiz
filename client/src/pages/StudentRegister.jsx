import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PasswordField from '../components/PasswordField';
import AuthLayout, { Alert } from '../components/AuthLayout';
import Icon from '../components/Icon';

export default function StudentRegister() {
  const [f, setF] = useState({ name: '', rollNumber: '', pin: '', password: '', confirmPassword: '' });
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const navigate = useNavigate(), [sp] = useSearchParams();
  const loginHref = '/student-login' + (sp.get('next') ? '?next=' + encodeURIComponent(sp.get('next')) : '');

  const register = async e => {
    e?.preventDefault();
    if (busy) return;
    if (!f.name.trim()) return setMsg('Enter your name.');
    if (!f.rollNumber.trim()) return setMsg('Enter your roll number.');
    if (!f.pin.trim()) return setMsg('Enter your registration PIN.');
    if (f.password.length < 6) return setMsg('Password must be at least 6 characters.');
    if (f.password !== f.confirmPassword) return setMsg('Passwords do not match.');
    setBusy(true); setMsg('');
    try {
      await api('/students/register', { method: 'POST', body: f });
      navigate(loginHref, { state: { msg: 'Registration successful. Please log in using your roll number and password.' } });
    } catch (err) { setMsg(err.message); setBusy(false); }
  };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const mismatch = f.confirmPassword && f.password !== f.confirmPassword;
  return (
    <AuthLayout icon="key" title="Create your account" subtitle="Ask your teacher for your roll number's registration PIN."
      points={['Only roll numbers authorized by your teacher can register', 'Your PIN works once, then your password takes over', 'One account, all your papers and results']}
      footer={<>Already registered? <Link className="link" to={loginHref}>Log in</Link></>}>
      <form onSubmit={register} noValidate>
        <Alert>{msg}</Alert>
        <label className="field" htmlFor="sr-name">Full name</label>
        <input id="sr-name" type="text" placeholder="Your name" value={f.name} onChange={set('name')} autoComplete="name" />
        <div className="grid cols-2 tight">
          <div>
            <label className="field" htmlFor="sr-roll">Roll number</label>
            <input id="sr-roll" type="text" placeholder="e.g. 23CS001" value={f.rollNumber} onChange={set('rollNumber')} autoComplete="username" autoCapitalize="characters" />
          </div>
          <div>
            <label className="field" htmlFor="sr-pin">Registration PIN</label>
            <input id="sr-pin" type="text" placeholder="From your teacher" value={f.pin} onChange={set('pin')} autoComplete="one-time-code" autoCapitalize="characters" />
          </div>
        </div>
        <label className="field" htmlFor="sr-pass">Create password</label>
        <PasswordField id="sr-pass" placeholder="At least 6 characters" value={f.password} onChange={set('password')} autoComplete="new-password" />
        <label className="field" htmlFor="sr-pass2">Confirm password</label>
        <PasswordField id="sr-pass2" placeholder="Type it again" value={f.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
        {mismatch && <p className="err small-text" style={{ margin: '-4px 0 10px' }}>Passwords do not match yet.</p>}
        <button type="submit" className="block" disabled={busy}>{busy ? <><span className="spinner" />Registering…</> : <>Register<Icon name="chevronRight" size={16} /></>}</button>
        <Link className="btn ghost block" to="/" style={{ marginTop: 10 }}>Back to home</Link>
      </form>
    </AuthLayout>
  );
}
