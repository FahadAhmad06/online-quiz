import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import usePoll, { POLL_FAST, POLL_SLOW } from '../../hooks/usePoll';
import LiveStatus from '../../components/LiveStatus';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';
import Icon from '../../components/Icon';
import { useConfirm, useToast } from '../../components/Feedback';
import api from '../../utils/api';

const secs = ms => ms === null ? '—' : (ms / 1000).toFixed(1) + 's';
const PROVIDER_LABEL = { gemini: 'Gemini', groq: 'Groq' };

function ProviderStatus({ providers }) {
  if (!providers) return null;
  return (
    <p className="muted small-text" style={{ margin: '4px 0 0' }}>
      {Object.entries(providers).map(([p, st], i) => (
        <span key={p}>
          {i > 0 && ' · '}
          {PROVIDER_LABEL[p] || p}: {st.state === 'available'
            ? <span style={{ color: 'var(--ok, #2e7d32)' }}>available</span>
            : <span style={{ color: 'var(--bad, #c62828)' }}>{st.state.replace('_', ' ')}{st.retryAt ? ' until ' + new Date(st.retryAt).toLocaleTimeString() : ''}</span>}
        </span>
      ))}
    </p>
  );
}

// Grading performance for this server process, from /admin/subjective/metrics.
function Metrics() {
  const m = usePoll('/admin/subjective/metrics', () => POLL_SLOW).data;
  if (!m) return null;
  const c = m.counters;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head"><h2 style={{ fontSize: 16 }}><span className="hicon"><Icon name="activity" size={16} /></span>AI grading performance</h2></div>
      {!m.totalMs.n ? <p className="muted small-text">No answers graded by this server process yet.</p> : (<>
        <p className="small-text" style={{ margin: 0 }}>
          Per answer: avg <b>{secs(m.totalMs.avg)}</b> · median <b>{secs(m.totalMs.p50)}</b> · p95 <b>{secs(m.totalMs.p95)}</b> over {m.totalMs.n} graded
          {' '}· single AI call median {secs(m.callMs.p50)} · queue wait p95 {secs(m.queueWaitMs.p95)}
          {m.submissionMs.n > 0 && <> · whole submission median {secs(m.submissionMs.p50)}</>}
        </p>
        <p className="muted small-text" style={{ margin: '4px 0 0' }}>
          {c.failed} failed · {c.retries} retries · {c.rateLimited} rate-limited · {c.timeouts} timeouts · {c.fallbackTriggered} fell back to the other provider
          {m.queue && <> · {m.queue.active}/{m.queue.concurrency} running, {m.queue.waiting} queued</>}
          {m.avgTokensPerAnswer && <> · ~{m.avgTokensPerAnswer.total} tokens/answer ({m.avgTokensPerAnswer.thoughts} thinking)</>}
        </p>
      </>)}
      <ProviderStatus providers={m.providers} />
      <p className="muted small-text" style={{ margin: '4px 0 0' }}>{m.scope}</p>
    </div>
  );
}

function AiBadge({ it }) {
  if (it.aiEvaluating) return <span className="badge info"><span className="spinner" style={{ width: 12, height: 12 }} />AI evaluating</span>;
  if (it.aiActive) return <span className="badge info"><Icon name="clock" />Pending AI ({it.aiActive})</span>;
  if (it.failed) return <span className="badge bad"><Icon name="alert" />Evaluation failed</span>;
  if (it.manualReview) return <span className="badge bad"><Icon name="alert" />Manual review</span>;
  if (it.pending) return <span className="badge warn"><Icon name="clock" />Awaiting approval</span>;
  return <span className="badge ok"><Icon name="check" />Done</span>;
}

export default function Subjective() {
  const [sp] = useSearchParams();
  const paper = sp.get('paper') || ''; // optional: arrived here from a quiz's own page, already scoped to it
  const [page, setPage] = useState(1), [status, setStatus] = useState(''), [q, setQ] = useState('');
  // Both refresh by themselves: fast while any answer is with the AI, slower otherwise so new
  // submissions and other admins' approvals still show up without a reload.
  const stats = usePoll('/admin/subjective/stats', s => s.pending + s.evaluating ? POLL_FAST : POLL_SLOW);
  const qs = new URLSearchParams({ page, ...(status ? { status } : {}), ...(q ? { q } : {}), ...(paper ? { paper } : {}) }).toString();
  const list = usePoll('/admin/subjective/submissions?' + qs, d => d.items.some(i => i.aiActive) ? POLL_FAST : POLL_SLOW);
  const setFilter = (setter, v) => { setter(v); setPage(1); };
  const confirm = useConfirm(), toast = useToast();
  const remove = async it => {
    if (!(await confirm({ title: 'Delete this submission?', message: 'Delete ' + it.name + ' (' + it.roll + ')\'s submission on ' + it.paperCode + '? Their answers, AI grading and any final result are removed permanently.', confirmText: 'Delete', danger: true }))) return;
    try { await api('/admin/subjective/submissions/' + it.attemptId, { method: 'DELETE' }); toast.ok('Submission deleted.'); list.reload(); stats.reload(); }
    catch (e) { toast.bad(e.message); }
  };

  return (<>
    <PageHeader title="Subjective Checking" subtitle={paper ? 'Filtered to quiz ' + paper + ' · showing AI-suggested marks for its written answers.' : 'Review AI-suggested marks for written answers and approve the final grade.'}>
      {paper && <Link className="btn ghost" to="/admin/subjective">Clear quiz filter</Link>}
      <LiveStatus live={list.live} onResume={() => { list.reload(); stats.reload(); }} />
    </PageHeader>
    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      {!stats.data ? [0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 16 }} />) : (<>
        <StatCard icon="clock" tone="blue" title="Awaiting AI" value={stats.data.pending + stats.data.evaluating} />
        <StatCard icon="edit" tone="purple" title="Awaiting review" value={stats.data.awaiting_review} />
        <StatCard icon="checkCircle" tone="green" title="Approved" value={stats.data.approved} />
        <StatCard icon="alert" tone="amber" title="Needs attention" value={stats.data.manual_review + stats.data.failed} delta={stats.data.failed ? stats.data.failed + ' failed' : null} />
      </>)}
    </div>
    <Metrics />
    <div className="card">
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search by name or roll number" value={q} onChange={e => setFilter(setQ, e.target.value)} aria-label="Search" /></div>
        <select value={status} onChange={e => setFilter(setStatus, e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="pending">Awaiting AI</option>
          <option value="evaluating">AI evaluating</option>
          <option value="awaiting_review">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="manual_review">Manual review</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} />
        : !list.data ? <Loading />
        : !list.data.items.length ? <EmptyState icon="edit">No subjective submissions match.</EmptyState>
        : (<>
          <div className="wrapx"><table>
            <thead><tr><th>Student</th><th>Paper</th><th>Submitted</th><th>Progress</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.data.items.map(it => (
              <tr key={it.attemptId}>
                <td><b>{it.name}</b><div className="muted small-text">{it.roll}</div></td>
                <td className="wrap">{it.paperTitle}<div className="muted small-text">{it.paperCode}</div></td>
                <td className="muted small-text">{new Date(it.submittedAt).toLocaleString()}</td>
                <td>{it.approved}/{it.questionCount} approved</td>
                <td><AiBadge it={it} /></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <Link className="btn ghost small" to={'/admin/subjective/' + it.attemptId}>Review</Link>
                  <button className="danger" onClick={() => remove(it)} aria-label={'Delete submission of ' + it.name}><Icon name="trash" size={15} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
          {list.data.pages > 1 && (
            <nav className="pagination" aria-label="Pagination">
              <span className="muted">Page {list.data.page} of {list.data.pages} ({list.data.total} total)</span>
              <div className="pages">
                <button className="ghost small" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={16} /></button>
                <button className="ghost small" disabled={page >= list.data.pages} onClick={() => setPage(p => p + 1)} aria-label="Next page"><Icon name="chevronRight" size={16} /></button>
              </div>
            </nav>
          )}
        </>)}
    </div>
  </>);
}
