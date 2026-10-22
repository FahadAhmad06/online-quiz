import { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Feedback';
import api from '../../utils/api';
import duration from '../../utils/duration';
import remaining from '../../utils/remaining';
import toLocalInput from '../../utils/toLocalInput';

// Start times go through POST /admin/papers/:id/schedule, which refuses changes once a student has started.
function ScheduleRow({ p, onSaved }) {
  const toast = useToast();
  const [val, setVal] = useState(null), [busy, setBusy] = useState(false);
  const save = async startsAt => {
    if (startsAt === undefined) return;
    setBusy(true);
    try { await api('/admin/papers/' + p._id + '/schedule', { method: 'POST', body: { startsAt } }); toast.ok(startsAt ? 'Start time saved for ' + p.title + '.' : 'Schedule cleared for ' + p.title + '.'); setVal(null); onSaved(); }
    catch (e) { toast.bad(e.message); }
    setBusy(false);
  };
  return (
    <tr>
      <td className="wrap"><Link to={'/admin/papers/' + p._id} style={{ textDecoration: 'none' }}><b>{p.title}</b></Link><div className="muted small-text">{p.code} · {p.questionCount} questions</div></td>
      <td>{val === null
        ? (p.startsAt ? new Date(p.startsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : <span className="muted">Starts immediately</span>)
        : <input type="datetime-local" value={val} onChange={e => setVal(e.target.value)} style={{ width: 220, marginBottom: 0 }} aria-label={'Start time for ' + p.title} />}</td>
      <td>{duration(p)}</td>
      <td><StatusBadge paper={p} /></td>
      <td className="muted small-text">{remaining(p)}</td>
      <td><div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
        {val === null ? <button className="outline small" onClick={() => setVal(toLocalInput(p.startsAt))}><Icon name="calendar" size={15} />{p.startsAt ? 'Reschedule' : 'Schedule'}</button> : (<>
          <button className="small" disabled={busy || !val} onClick={() => save(new Date(val).toISOString())}>{busy ? 'Saving…' : 'Save'}</button>
          {p.startsAt && <button className="ghost small" disabled={busy} onClick={() => save(null)}>Clear</button>}
          <button className="ghost small" disabled={busy} onClick={() => setVal(null)}>Cancel</button>
        </>)}
      </div></td>
    </tr>
  );
}

export default function Schedule() {
  const state = useFetch('/admin/papers'), [filter, setFilter] = useState('');
  const rank = p => p.status === 'scheduled' ? 0 : p.status === 'active' ? 1 : 2;
  return (<>
    <PageHeader title="Paper Schedule" subtitle="Set when each paper opens. The exam countdown starts at the scheduled time, not when a student clicks Start.">
      <Link className="btn" to="/admin/papers/new"><Icon name="plus" size={16} />Create quiz</Link>
    </PageHeader>
    <div className="card">
      <Async state={state}>{papers => {
        const rows = papers.filter(p => !filter || (filter === 'unscheduled' ? !p.startsAt : p.status === filter))
          .sort((a, b) => rank(a) - rank(b) || (a.status === 'scheduled' ? new Date(a.startsAt) - new Date(b.startsAt) : new Date(b.startsAt || b.createdAt) - new Date(a.startsAt || a.createdAt)));
        return (<>
          <div className="toolbar">
            <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter papers">
              <option value="">All papers ({papers.length})</option>
              <option value="scheduled">Upcoming</option><option value="active">Live</option><option value="expired">Link expired</option><option value="unscheduled">No start time</option>
            </select>
          </div>
          {!rows.length ? <EmptyState icon="calendar">{papers.length ? 'No papers match this filter.' : 'No papers yet.'}</EmptyState> : (
            <div className="wrapx"><table>
              <thead><tr><th>Paper</th><th>Start time</th><th>Duration</th><th>Status</th><th>Link</th><th>Actions</th></tr></thead>
              <tbody>{rows.map(p => <ScheduleRow key={p._id} p={p} onSaved={state.reload} />)}</tbody>
            </table></div>
          )}
        </>);
      }}</Async>
    </div>
  </>);
}
