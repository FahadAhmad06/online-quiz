import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import CopyField from '../../components/CopyField';
import api from '../../utils/api';

function status(a) {
  if (!a.isEnabled) return <span className="badge bad">Disabled</span>;
  if (a.isRegistered) return <span className="badge ok">Registered</span>;
  return <span className="badge">Available</span>;
}

export default function Rolls() {
  const state = useFetch('/admin/rolls');
  const [one, setOne] = useState({ rollNumber: '', pin: '' });
  const [bulk, setBulk] = useState('');
  const [reveal, setReveal] = useState(null); // { rollNumber, pin } | { created: [...] }
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  const act = async (fn, after) => {
    setMsg(''); setBusy(true);
    try { const r = await fn(); if (after) after(r); state.reload(); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const add = () => act(() => api('/admin/rolls', { method: 'POST', body: one }), r => { setReveal(r); setOne({ rollNumber: '', pin: '' }); });
  const addBulk = () => act(() => api('/admin/rolls/bulk', { method: 'POST', body: { rollNumbers: bulk } }), r => { setReveal(r); setBulk(''); });
  const regenerate = a => act(() => api('/admin/rolls/' + a._id + '/regenerate', { method: 'POST' }), setReveal);
  const disable = a => act(() => api('/admin/rolls/' + a._id + '/disable', { method: 'POST' }));
  const enable = a => act(() => api('/admin/rolls/' + a._id + '/enable', { method: 'POST' }));
  const remove = a => confirm('Remove roll number ' + a.rollNumber + '?') && act(() => api('/admin/rolls/' + a._id, { method: 'DELETE' }));

  return (
    <Async state={state}>{rolls => (<>
      {reveal && (
        <div className="card">
          <h2>Registration PIN{reveal.created ? 's' : ''} — shown once</h2>
          <p className="muted">Give this to the student privately. It will not be shown again — regenerate if lost.</p>
          {reveal.pin && <CopyField label={reveal.rollNumber} value={reveal.pin} />}
          {reveal.created?.map(c => <CopyField key={c.rollNumber} label={c.rollNumber} value={c.pin} />)}
          {reveal.skipped?.length > 0 && <p className="muted">Already on the list, skipped: {reveal.skipped.join(', ')}</p>}
          <button className="ghost small" onClick={() => setReveal(null)}>Dismiss</button>
        </div>
      )}
      <div className="card">
        <h2>Authorize a roll number</h2>
        <input type="text" placeholder="Roll number" value={one.rollNumber} onChange={e => setOne({ ...one, rollNumber: e.target.value })} />
        <input type="text" placeholder="PIN (leave blank to generate one)" value={one.pin} onChange={e => setOne({ ...one, pin: e.target.value })} />
        <button onClick={add} disabled={busy || !one.rollNumber.trim()}>Add roll number</button>
        <h2 style={{ marginTop: 18 }}>Bulk-add</h2>
        <p className="muted">One roll number per line (or comma-separated). A unique PIN is generated for each.</p>
        <textarea placeholder={'ROLL001\nROLL002\nROLL003'} value={bulk} onChange={e => setBulk(e.target.value)} />
        <button onClick={addBulk} disabled={busy || !bulk.trim()}>Bulk-add</button>
        <p className="err msg" role="alert">{msg}</p>
      </div>
      <div className="card">
        <h2>Roll numbers ({rolls.length})</h2>
        <div className="wrapx">
          <table>
            <thead><tr><th>Roll number</th><th>Status</th><th>Registered student</th><th></th></tr></thead>
            <tbody>
              {rolls.map(a => (
                <tr key={a._id}>
                  <td>{a.rollNumber}</td>
                  <td>{status(a)}</td>
                  <td>{a.registeredStudent?.name || <span className="muted">—</span>}</td>
                  <td>
                    <div className="row">
                      {!a.isRegistered && <button className="small" onClick={() => regenerate(a)} disabled={busy}>Regenerate PIN</button>}
                      {a.isEnabled ? <button className="ghost small" onClick={() => disable(a)} disabled={busy}>Disable</button>
                        : <button className="ghost small" onClick={() => enable(a)} disabled={busy}>Enable</button>}
                      {!a.isRegistered && <button className="danger" onClick={() => remove(a)} disabled={busy}>Remove</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>)}</Async>
  );
}
