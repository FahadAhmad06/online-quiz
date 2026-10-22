import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import api from '../../utils/api';
import validEmail from '../../utils/validEmail';
import PasswordField from '../../components/PasswordField';
import Icon from '../../components/Icon';
import { useConfirm, useToast } from '../../components/Feedback';

// Owner-only (the server enforces it too: /admin/admins is behind requireOwner). Rendered inside Settings.
export default function Admins() {
  const state = useFetch('/admin/admins'), toast = useToast(), confirm = useConfirm();
  const [f, setF] = useState({ email: '', password: '' }), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const add = async () => {
    if (!validEmail(f.email.trim())) return setMsg('Enter a valid email address.');
    if (f.password.length < 6) return setMsg('Password must be at least 6 characters.');
    setBusy(true); setMsg('');
    try { await api('/admin/admins', { method: 'POST', body: f }); toast.ok(f.email.trim() + ' is now an admin.'); setF({ email: '', password: '' }); state.reload(); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const remove = async a => {
    if (!(await confirm({ title: 'Remove admin?', message: 'Remove admin rights from ' + a.email + '? They will be signed out on their next request.', confirmText: 'Remove admin', danger: true }))) return;
    try { await api('/admin/admins/' + a._id, { method: 'DELETE' }); toast.ok(a.email + ' removed.'); state.reload(); } catch (e) { toast.bad(e.message); }
  };
  return (
    <div className="card">
      <div className="card-head"><h2><span className="hicon"><Icon name="shield" size={16} /></span>Admins</h2></div>
      <Async state={state}>{({ owner, admins }) => (<>
        <div className="qrow" style={{ borderTop: 0 }}><div><b>{owner}</b><div className="muted small-text">Owner (cannot be removed)</div></div><span className="badge info"><Icon name="shield" />Owner</span></div>
        {admins.map(a => (
          <div className="qrow" key={a._id}><div><b>{a.email}</b><div className="muted small-text">Admin since {new Date(a.createdAt).toLocaleDateString()}</div></div>
            <button className="danger" onClick={() => remove(a)}>Remove admin</button></div>
        ))}
        <div style={{ marginTop: 12, paddingTop: 16, borderTop: '1px solid var(--line)', maxWidth: 480 }}>
          <h3>Add an admin</h3>
          <input type="email" placeholder="Email to make admin" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} aria-label="Admin email" />
          <PasswordField placeholder="Password for this admin (min 6 characters)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
          <button onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Make admin'}</button>
          <p className="err msg" role="alert">{msg}</p>
        </div>
      </>)}</Async>
    </div>
  );
}
