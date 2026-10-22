import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import StatusBadge from '../../components/StatusBadge';
import CopyField from '../../components/CopyField';
import ResultsTable from '../../components/ResultsTable';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/Icon';
import { useConfirm, useToast } from '../../components/Feedback';
import api from '../../utils/api';
import UNIT from '../../utils/units';
import linkOf from '../../utils/linkOf';
import remaining from '../../utils/remaining';
import isOpen from '../../utils/isOpen';
import beginTest from '../../utils/beginTest';
import downloadCsv from '../../utils/downloadCsv';
import duration from '../../utils/duration';
import optionLabel from '../../utils/optionLabel';
import toLocalInput from '../../utils/toLocalInput';
import useRetakes from '../../hooks/useRetakes';

export default function PaperDetail() {
  const { id } = useParams(), navigate = useNavigate(), [sp] = useSearchParams();
  const toast = useToast(), confirm = useConfirm();
  const state = useFetch('/admin/papers/' + id), [busy, setBusy] = useState(false), [showQ, setShowQ] = useState(false);
  const [startsAtInput, setStartsAtInput] = useState(null); // null = not editing
  const retakes = useRetakes();
  // Runs one admin action: blocks double clicks, toasts the outcome, then refreshes (or runs `after`).
  const act = async (fn, okText, after) => {
    setBusy(true);
    try { await fn(); if (okText) toast.ok(okText); after ? after() : state.reload(); } catch (e) { toast.bad(e.message); }
    setBusy(false);
  };
  const post = (action, body, okText) => act(() => api('/admin/papers/' + id + '/' + action, { method: 'POST', body }), okText);
  const schedule = startsAt => act(() => api('/admin/papers/' + id + '/schedule', { method: 'POST', body: { startsAt } }), startsAt ? 'Start time saved.' : 'Schedule cleared.', () => { setStartsAtInput(null); state.reload(); });

  return (
    <Async state={state}>{({ paper: p, results, stats }) => (<>
      <PageHeader title={p.title} subtitle={<><StatusBadge paper={p} /> <span style={{ marginLeft: 6 }}>{p.questionCount} questions · {p.perQ ? duration(p) + ' total for the test' : 'no time limit'} · {remaining(p)}</span></>}>
        <Link className="btn ghost" to="/admin/papers"><Icon name="chevronLeft" size={16} />All quizzes</Link>
        {stats.count === 0 && <Link className="btn ghost" to={'/admin/papers/' + id + '/edit'}><Icon name="edit" size={16} />Edit</Link>}
        <button className="outline" disabled={busy} onClick={() => act(async () => { beginTest(await api('/admin/papers/' + id + '/preview', { method: 'POST' })); }, null, () => navigate('/test'))}><Icon name="eye" size={16} />Preview as student</button>
      </PageHeader>
      {sp.get('created') && <div className="notice"><Icon name="checkCircle" /><span><b>Paper created.</b> Share the code or link below with your students.</span></div>}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-head"><h2><span className="hicon"><Icon name="file" size={16} /></span>Share</h2></div>
          <CopyField label="Paper code" value={p.code} />
          <CopyField label="Student link" value={linkOf(p.code)} />
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-head"><h2><span className="hicon"><Icon name="calendar" size={16} /></span>Schedule & link</h2></div>
          <div className="muted small-text">Start time</div>
          <div className="row" style={{ marginBottom: 14 }}>
            {startsAtInput === null ? (<>
              <b>{p.startsAt ? new Date(p.startsAt).toLocaleString() : 'Starts immediately'}</b>
              <button className="ghost small" onClick={() => setStartsAtInput(toLocalInput(p.startsAt))}>Change</button>
            </>) : (<>
              <input type="datetime-local" value={startsAtInput} onChange={e => setStartsAtInput(e.target.value)} style={{ width: 230, marginBottom: 0 }} aria-label="Start time" />
              <button className="small" disabled={busy} onClick={() => schedule(startsAtInput ? new Date(startsAtInput).toISOString() : null)}>Save</button>
              {p.startsAt && <button className="ghost small" disabled={busy} onClick={() => schedule(null)}>Clear (start immediately)</button>}
              <button className="ghost small" onClick={() => setStartsAtInput(null)}>Cancel</button>
            </>)}
          </div>
          <div className="muted small-text">Link</div>
          <div className="row">
            {p.expiresAt && <button className="ghost small" disabled={busy} onClick={() => post('extend', { ms: UNIT.hours }, 'Extended by 1 hour.')}>+1 hour</button>}
            {p.expiresAt && <button className="ghost small" disabled={busy} onClick={() => post('extend', { ms: UNIT.days }, 'Extended by 1 day.')}>+1 day</button>}
            {isOpen(p) && p.expiresAt && <button className="ghost small" disabled={busy} onClick={async () => (await confirm({ title: 'Close this link now?', message: 'Students will no longer be able to open or start this paper.', confirmText: 'Close link' })) && post('close', undefined, 'Link closed.')}>Close now</button>}
            {!isOpen(p) && <button className="small" disabled={busy} onClick={() => post('reopen', { ms: UNIT.days }, 'Reopened for 24 hours.')}>Reopen for 24 hours</button>}
            <button className="danger" disabled={busy} onClick={async () => (await confirm({ title: 'Delete this paper?', message: 'This permanently deletes the paper, all its results and any in-progress attempts.', confirmText: 'Delete paper', danger: true })) && act(() => api('/admin/papers/' + id, { method: 'DELETE' }), 'Paper deleted.', () => navigate('/admin/papers'))}><Icon name="trash" size={15} />Delete paper</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2><span className="hicon"><Icon name="quiz" size={16} /></span>Questions ({p.questions.length})</h2>
          <button className="link" onClick={() => setShowQ(v => !v)} aria-expanded={showQ}>{showQ ? 'Hide' : 'Show'}</button>
        </div>
        {showQ && p.questions.map((q, i) => (
          <div className="qrow" key={i}><div><b>{i + 1}. {q.text}</b>
            <div className="muted small-text">{q.options.map((o, k) => <span key={k} style={k === q.correct ? { color: 'var(--ok-line)', fontWeight: 600 } : undefined}>{optionLabel(k)}) {o}{k === q.correct ? ' ✓' : ''}{k < q.options.length - 1 ? ' · ' : ''}</span>)}</div>
          </div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h2><span className="hicon"><Icon name="chart" size={16} /></span>Results ({stats.count})</h2>
          {stats.count > 0 && (
            <div className="row">
              <button className="ghost small" onClick={() => downloadCsv(p.title + '-results', results)}><Icon name="download" size={15} />Download CSV</button>
              <button className="danger" disabled={busy} onClick={async () => (await confirm({ title: 'Clear all results?', message: 'Every result for this paper will be permanently deleted.', confirmText: 'Clear results', danger: true })) && act(() => api('/admin/papers/' + id + '/results', { method: 'DELETE' }), 'Results cleared.')}>Clear results</button>
            </div>
          )}
        </div>
        {stats.count > 0 && <p className="muted" style={{ marginTop: -6 }}>Average {stats.average}/{stats.total} ({stats.averagePercent}%) · Highest {stats.highest}/{stats.total}</p>}
        <ResultsTable rows={results}
          onDelete={async r => (await confirm({ title: 'Delete this result?', message: 'Delete the result of ' + r.name + ' (' + r.roll + ')?', confirmText: 'Delete', danger: true })) && act(() => api('/admin/results/' + r._id, { method: 'DELETE' }), 'Result deleted.')}
          {...retakes.tableProps} />
      </div>
    </>)}</Async>
  );
}
