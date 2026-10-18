import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import ResultsTable from '../../components/ResultsTable';
import api from '../../utils/api';
import downloadCsv from '../../utils/downloadCsv';
export default function Results() {
  const [paper, setPaper] = useState(''), [q, setQ] = useState(''), [sort, setSort] = useState('score'), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const papers = useFetch('/admin/papers');
  const state = useFetch('/admin/results' + (paper ? '?paper=' + paper : ''));
  const retakes = useFetch('/admin/retakes');
  const allowedSet = new Set((retakes.data || []).filter(g => g.retakeAllowed).map(g => g.roll + '|' + g.paperCode));
  const cancelledSet = new Set((retakes.data || []).filter(g => g.retakeCancelled).map(g => g.roll + '|' + g.paperCode));
  const del = async r => {
    if (!confirm('Delete the result of ' + r.name + '?')) return;
    try { await api('/admin/results/' + r._id, { method: 'DELETE' }); state.reload(); } catch (e) { setErr(e.message); }
  };
  const allowRetake = async r => {
    setErr(''); setMsg('');
    try {
      await api('/admin/retakes', { method: 'POST', body: { rollNumber: r.roll, paperCode: r.paperCode } });
      setMsg('Retake allowed for ' + r.name + ' (' + r.roll + ') on ' + r.paperCode + '.');
      retakes.reload();
    } catch (e) { setErr(e.message); }
  };
  const cancelRetake = async r => {
    setErr(''); setMsg('');
    try {
      await api('/admin/retakes/cancel', { method: 'POST', body: { rollNumber: r.roll, paperCode: r.paperCode } });
      setMsg('Retake cancelled for ' + r.name + ' (' + r.roll + ') on ' + r.paperCode + '.');
      retakes.reload();
    } catch (e) { setErr(e.message); }
  };
  const view = rows => {
    const s = q.trim().toLowerCase();
    const f = rows.filter(r => !s || [r.name, r.roll, r.email].join(' ').toLowerCase().includes(s));
    return f.sort(sort === 'date' ? (a, b) => new Date(b.createdAt) - new Date(a.createdAt) : (a, b) => b.percent - a.percent || a.rank - b.rank);
  };
  return (<>
    <h2>All results</h2>
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={paper} onChange={e => setPaper(e.target.value)} aria-label="Filter by paper">
          <option value="">All papers</option>
          {(papers.data || []).map(p => <option key={p._id} value={p.code}>{p.title} ({p.code})</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort by">
          <option value="score">Sort: highest score</option><option value="date">Sort: newest</option>
        </select>
      </div>
      <input type="text" placeholder="Search by name, roll number or email" value={q} onChange={e => setQ(e.target.value)} />
      <Async state={state}>{rows => {
        const v = view(rows);
        return (<>
          <ResultsTable rows={v} showPaper onDelete={del} onAllowRetake={allowRetake} onCancelRetake={cancelRetake}
            retakeAllowed={r => allowedSet.has(r.roll + '|' + r.paperCode)}
            retakeCancelled={r => cancelledSet.has(r.roll + '|' + r.paperCode)} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="ghost" disabled={!v.length} onClick={() => downloadCsv('quiz-results', v)}>Download CSV</button>
          </div>
        </>);
      }}</Async>
      {msg && <p className="msg" style={{ color: 'var(--ok-line)', fontWeight: 600 }}>{msg}</p>}
      <p className="err msg" role="alert">{err}</p>
    </div>
  </>);
}
