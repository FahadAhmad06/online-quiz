import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import StatusBadge from '../../components/StatusBadge';
import CopyField from '../../components/CopyField';
import ResultsTable from '../../components/ResultsTable';
import api from '../../utils/api';
import UNIT from '../../utils/units';
import linkOf from '../../utils/linkOf';
import remaining from '../../utils/remaining';
import isOpen from '../../utils/isOpen';
import beginTest from '../../utils/beginTest';
import downloadCsv from '../../utils/downloadCsv';

export default function PaperDetail() {
  const { id } = useParams(), navigate = useNavigate(), [sp] = useSearchParams();
  const state = useFetch('/admin/papers/' + id), [err, setErr] = useState('');
  const act = async (fn, after) => { setErr(''); try { await fn(); after ? after() : state.reload(); } catch (e) { setErr(e.message); } };
  const post = (action, body) => act(() => api('/admin/papers/' + id + '/' + action, { method: 'POST', body }));

  return (
    <Async state={state}>{({ paper: p, results, stats }) => (<>
      {sp.get('created') && <div className="card"><b>Paper created.</b> Share the code or link below with your students.</div>}
      <div className="card">
        <h2>{p.title} <StatusBadge paper={p} /></h2>
        <p className="muted">{p.questionCount} questions · {p.perQ ? p.perQ / 60 + ' min per question' : 'no time limit'} · {remaining(p)}</p>
        <CopyField label="Paper code" value={p.code} />
        <CopyField label="Student link" value={linkOf(p.code)} />
        <div className="row">
          {p.expiresAt && <button className="ghost small" onClick={() => post('extend', { ms: UNIT.hours })}>+1 hour</button>}
          {p.expiresAt && <button className="ghost small" onClick={() => post('extend', { ms: UNIT.days })}>+1 day</button>}
          {isOpen(p) && p.expiresAt && <button className="ghost small" onClick={() => post('close')}>Close now</button>}
          {!isOpen(p) && <button className="small" onClick={() => post('reopen', { ms: UNIT.days })}>Reopen for 24 hours</button>}
          <button className="ghost small" onClick={() => act(async () => { beginTest(await api('/admin/papers/' + id + '/preview', { method: 'POST' })); }, () => navigate('/test'))}>Preview as student</button>
          <button className="danger" onClick={() => confirm('Delete this paper and all its results?') && act(() => api('/admin/papers/' + id, { method: 'DELETE' }), () => navigate('/admin/papers'))}>Delete paper</button>
        </div>
        <p className="err msg" role="alert">{err}</p>
      </div>
      <div className="card">
        <h2>Results ({stats.count})</h2>
        {stats.count > 0 && <p className="muted">Average {stats.average}/{stats.total} ({stats.averagePercent}%) · Highest {stats.highest}/{stats.total}</p>}
        <ResultsTable rows={results} onDelete={r => confirm('Delete the result of ' + r.name + '?') && act(() => api('/admin/results/' + r._id, { method: 'DELETE' }))} />
        {stats.count > 0 && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="ghost" onClick={() => downloadCsv(p.title + '-results', results)}>Download CSV</button>
            <button className="danger" onClick={() => confirm('Delete all results of this paper?') && act(() => api('/admin/papers/' + id + '/results', { method: 'DELETE' }))}>Clear results</button>
          </div>
        )}
      </div>
    </>)}</Async>
  );
}
