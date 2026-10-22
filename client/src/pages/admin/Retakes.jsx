import { useState } from 'react';
import useRetakes from '../../hooks/useRetakes';
import usePaged from '../../hooks/usePaged';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import Pagination from '../../components/Pagination';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';
import Icon from '../../components/Icon';

// One row per student + paper they have submitted (GET /admin/retakes), with the current permission.
export default function Retakes() {
  const rt = useRetakes(), papers = useFetch('/admin/papers');
  const [q, setQ] = useState(''), [filter, setFilter] = useState(''), [paper, setPaper] = useState('');
  const s = q.trim().toLowerCase();
  const st = g => g.retakeAllowed ? 'allowed' : g.retakeCancelled ? 'cancelled' : 'none';
  const rows = rt.rows.filter(g => (!filter || st(g) === filter) && (!paper || g.paperCode === paper) && (!s || (g.name + ' ' + g.roll).toLowerCase().includes(s)));
  const pg = usePaged(rows, 20, s + filter + paper);
  const allowedCount = rt.rows.filter(g => g.retakeAllowed).length;

  return (<>
    <PageHeader title="Retake Requests" subtitle="A student can sit a submitted paper again only after you allow it. Each permission is used once, when they start." />
    <div className="card">
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search by name or roll number" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" /></div>
        <select value={paper} onChange={e => setPaper(e.target.value)} aria-label="Filter by paper">
          <option value="">All papers</option>
          {(papers.data || []).map(p => <option key={p._id} value={p.code}>{p.title} ({p.code})</option>)}
        </select>
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by retake status">
          <option value="">Any status</option>
          <option value="allowed">Retake allowed ({allowedCount})</option>
          <option value="none">No retake</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {rt.state.error ? <ErrorBox message={rt.state.error} onRetry={rt.state.reload} />
        : !rt.state.data ? <Loading />
        : !rows.length ? <EmptyState icon="retake">{rt.rows.length ? 'Nothing matches your filters.' : 'No submitted attempts yet. Students appear here once they finish a paper.'}</EmptyState>
        : (<>
          <div className="wrapx"><table>
            <thead><tr><th>Student</th><th>Paper</th><th>Attempts</th><th>Last score</th><th>Last submitted</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{pg.rows.map(g => {
              const busy = rt.pending === rt.key(g);
              return (
                <tr key={rt.key(g)}>
                  <td><b>{g.name}</b><div className="muted small-text">{g.roll}</div></td>
                  <td className="wrap">{g.paperTitle}<div className="muted small-text">{g.paperCode}</div></td>
                  <td>{g.attempts}</td>
                  <td>{g.lastCorrect}/{g.lastTotal}</td>
                  <td className="muted small-text">{new Date(g.lastAt).toLocaleString()}</td>
                  <td>{g.retakeAllowed ? <span className="badge ok"><Icon name="check" />Allowed</span>
                    : g.retakeCancelled ? <span className="badge bad"><Icon name="close" />Cancelled</span>
                    : <span className="badge"><Icon name="minus" />None</span>}</td>
                  <td>{g.retakeAllowed
                    ? <button className="ghost small" disabled={busy} onClick={() => rt.cancel(g)}>{busy ? 'Saving…' : 'Cancel retake'}</button>
                    : <button className="small" disabled={busy} onClick={() => rt.allow(g)}>{busy ? 'Saving…' : 'Allow retake'}</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <Pagination {...pg} />
        </>)}
    </div>
  </>);
}
