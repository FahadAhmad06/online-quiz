import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import usePaged from '../../hooks/usePaged';
import Async from '../../components/Async';
import CopyField from '../../components/CopyField';
import PageHeader from '../../components/PageHeader';
import Pagination from '../../components/Pagination';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import { useConfirm, useToast } from '../../components/Feedback';
import api from '../../utils/api';

function status(a) {
  if (!a.isEnabled) return <span className="badge bad"><Icon name="lock" />Disabled</span>;
  if (a.isRegistered) return <span className="badge ok"><Icon name="checkCircle" />Registered</span>;
  return <span className="badge"><Icon name="clock" />Available</span>;
}
const statusKey = a => !a.isEnabled ? 'disabled' : a.isRegistered ? 'registered' : 'available';

function RollTable({ rolls, busy, onRegenerate, onToggle, onRemove }) {
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || ''), [filter, setFilter] = useState('');
  const s = q.trim().toLowerCase();
  const rows = rolls.filter(a => (!filter || statusKey(a) === filter) && (!s || (a.rollNumber + ' ' + (a.registeredStudent?.name || '')).toLowerCase().includes(s)));
  const pg = usePaged(rows, 20, s + filter);
  return (<>
    <div className="toolbar">
      <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search roll number or student" value={q} onChange={e => setQ(e.target.value)} aria-label="Search roll numbers" /></div>
      <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status">
        <option value="">All ({rolls.length})</option>
        <option value="available">Available ({rolls.filter(a => statusKey(a) === 'available').length})</option>
        <option value="registered">Registered ({rolls.filter(a => statusKey(a) === 'registered').length})</option>
        <option value="disabled">Disabled ({rolls.filter(a => statusKey(a) === 'disabled').length})</option>
      </select>
    </div>
    {!rows.length ? <EmptyState icon="key">{rolls.length ? 'No roll numbers match your filters.' : 'No roll numbers yet. Authorize one above.'}</EmptyState> : (<>
      <div className="wrapx"><table>
        <thead><tr><th>Roll number</th><th>Status</th><th>Registered student</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody>{pg.rows.map(a => (
          <tr key={a._id}>
            <td><b>{a.rollNumber}</b></td>
            <td>{status(a)}</td>
            <td>{a.registeredStudent?.name || <span className="muted">—</span>}</td>
            <td className="muted small-text">{new Date(a.createdAt).toLocaleDateString()}</td>
            <td><div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              {!a.isRegistered && <button className="small" onClick={() => onRegenerate(a)} disabled={busy}>Regenerate PIN</button>}
              <button className="ghost small" onClick={() => onToggle(a)} disabled={busy}>{a.isEnabled ? 'Disable' : 'Enable'}</button>
              <button className="danger" onClick={() => onRemove(a)} disabled={busy}>{a.isRegistered ? 'Delete student' : 'Remove'}</button>
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Pagination {...pg} />
    </>)}
  </>);
}

export default function Rolls() {
  const state = useFetch('/admin/rolls'), toast = useToast(), confirm = useConfirm();
  const [one, setOne] = useState({ rollNumber: '', pin: '' });
  const [bulk, setBulk] = useState('');
  const [reveal, setReveal] = useState(null); // { rollNumber, pin } | { created: [...] }
  const [busy, setBusy] = useState(false);

  const act = async (fn, okText, after) => {
    setBusy(true);
    try { const r = await fn(); if (after) after(r); if (okText) toast.ok(typeof okText === 'function' ? okText(r) : okText); state.reload(); }
    catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const add = () => {
    if (one.pin.trim() && one.pin.trim().length < 6) return toast.bad('PIN must be at least 6 characters.');
    act(() => api('/admin/rolls', { method: 'POST', body: one }), r => 'Roll number ' + r.rollNumber + ' authorized.', r => { setReveal(r); setOne({ rollNumber: '', pin: '' }); });
  };
  const addBulk = () => act(() => api('/admin/rolls/bulk', { method: 'POST', body: { rollNumbers: bulk } }), r => r.created.length + ' added' + (r.skipped.length ? ', ' + r.skipped.length + ' skipped' : '') + '.', r => { setReveal(r); setBulk(''); });
  const regenerate = async a => (await confirm({ title: 'Regenerate PIN?', message: 'The old PIN for ' + a.rollNumber + ' will stop working immediately.', confirmText: 'Regenerate' }))
    && act(() => api('/admin/rolls/' + a._id + '/regenerate', { method: 'POST' }), 'New PIN generated.', setReveal);
  const toggle = a => act(() => api('/admin/rolls/' + a._id + '/' + (a.isEnabled ? 'disable' : 'enable'), { method: 'POST' }), a.rollNumber + (a.isEnabled ? ' disabled.' : ' enabled.'));
  const remove = async a => {
    const ok = await confirm(a.isRegistered
      ? { title: 'Delete student account?', message: 'Delete ' + (a.registeredStudent?.name || a.rollNumber) + ' (' + a.rollNumber + ')? This permanently deletes their account; they will need to register again with a new PIN. Their past results are not affected.', confirmText: 'Delete student', danger: true }
      : { title: 'Remove roll number?', message: 'Remove ' + a.rollNumber + ' from the allowed list?', confirmText: 'Remove', danger: true });
    if (ok) act(() => api('/admin/rolls/' + a._id, { method: 'DELETE' }), a.isRegistered ? 'Student deleted.' : 'Roll number removed.');
  };

  return (<>
    <PageHeader title="Roll & PIN Management" subtitle="Only authorized roll numbers with a valid one-time PIN can register." />
    {reveal && (
      <div className="card elevated" style={{ borderColor: 'var(--warn-line)' }}>
        <div className="card-head">
          <h2><span className="hicon"><Icon name="key" size={16} /></span>Registration PIN{reveal.created ? 's' : ''}, shown once</h2>
          <button className="ghost small" onClick={() => setReveal(null)}>Dismiss</button>
        </div>
        <p className="muted" style={{ marginTop: -6 }}>Give this to the student privately. It will not be shown again. Regenerate it if it's lost.</p>
        {reveal.pin && <CopyField label={reveal.rollNumber} value={reveal.pin} />}
        {reveal.created?.map(c => <CopyField key={c.rollNumber} label={c.rollNumber} value={c.pin} />)}
        {reveal.created && !reveal.created.length && <p className="muted">No new roll numbers were added.</p>}
        {reveal.skipped?.length > 0 && <p className="muted">Already on the list, skipped: {reveal.skipped.join(', ')}</p>}
      </div>
    )}
    <div className="grid cols-2" style={{ marginBottom: 16 }}>
      <div className="card" style={{ margin: 0 }}>
        <div className="card-head"><h2><span className="hicon"><Icon name="plus" size={16} /></span>Authorize a roll number</h2></div>
        <input type="text" placeholder="Roll number" value={one.rollNumber} onChange={e => setOne({ ...one, rollNumber: e.target.value })} aria-label="Roll number" />
        <input type="text" placeholder="PIN (leave blank to generate one)" value={one.pin} onChange={e => setOne({ ...one, pin: e.target.value })} aria-label="PIN" autoComplete="off" />
        <button onClick={add} disabled={busy || !one.rollNumber.trim()}>Add roll number</button>
      </div>
      <div className="card" style={{ margin: 0 }}>
        <div className="card-head"><h2><span className="hicon"><Icon name="students" size={16} /></span>Bulk add</h2></div>
        <textarea placeholder={'One roll number per line (or comma-separated)\nROLL001\nROLL002'} value={bulk} onChange={e => setBulk(e.target.value)} aria-label="Roll numbers to add" />
        <button onClick={addBulk} disabled={busy || !bulk.trim()}>Bulk add with generated PINs</button>
      </div>
    </div>
    <div className="card">
      <Async state={state}>{rolls => <RollTable rolls={rolls} busy={busy} onRegenerate={regenerate} onToggle={toggle} onRemove={remove} />}</Async>
    </div>
  </>);
}
