import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import api from '../../utils/api';
import validEmail from '../../utils/validEmail';
import PasswordField from '../../components/PasswordField';
export default function Admins() {
  const state = useFetch('/admin/admins');
  const [f, setF] = useState({ email: '', password: '' }), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const add = async () => {
    if (!validEmail(f.email.trim())) return setMsg('Enter a valid email address.');
    if (f.password.length < 6) return setMsg('Password must be at least 6 characters.');
    setBusy(true); setMsg('');
    try { await api('/admin/admins', { method: 'POST', body: f }); setF({ email: '', password: '' }); state.reload(); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const remove = async a => {
    if (!confirm('Remove admin rights from ' + a.email + '?')) return;
    try { await api('/admin/admins/' + a._id, { method: 'DELETE' }); state.reload(); } catch (e) { setMsg(e.message); }
  };
  return (
    <Async state={state}>{({ owner, admins }) => (
      <div className="card">
        <h2>Admins</h2><p className="muted">Only the owner can add or remove admins.</p>
        <div className="qrow"><div><b>{owner}</b><div className="muted">Owner (cannot be removed)</div></div></div>
        {admins.map(a => (
          <div className="qrow" key={a._id}><div><b>{a.email}</b><div className="muted">Admin</div></div>
            <button className="danger" onClick={() => remove(a)}>Remove admin</button></div>
        ))}
        <div style={{ marginTop: 12 }}>
          <input type="email" placeholder="Email to make admin" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <PasswordField placeholder="Password for this admin (min 6 characters)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
          <button onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Make admin'}</button>
          <p className="err msg" role="alert">{msg}</p>
        </div>
      </div>
    )}</Async>
  );
}
