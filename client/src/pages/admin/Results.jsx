import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import useRetakes from '../../hooks/useRetakes';
import Async from '../../components/Async';
import ResultsTable from '../../components/ResultsTable';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import Icon from '../../components/Icon';
import { useConfirm, useToast } from '../../components/Feedback';
import api from '../../utils/api';
import downloadCsv from '../../utils/downloadCsv';

export default function Results() {
  const [paper, setPaper] = useState(''), [q, setQ] = useState(''), [sort, setSort] = useState('score');
  const toast = useToast(), confirm = useConfirm();
  const papers = useFetch('/admin/papers');
  const state = useFetch('/admin/results' + (paper ? '?paper=' + paper : ''));
  const retakes = useRetakes();
  const del = async r => {
    if (!(await confirm({ title: 'Delete this result?', message: 'Delete the result of ' + r.name + ' (' + r.roll + ') on ' + r.paperCode + '?', confirmText: 'Delete', danger: true }))) return;
    try { await api('/admin/results/' + r._id, { method: 'DELETE' }); toast.ok('Result deleted.'); state.reload(); } catch (e) { toast.bad(e.message); }
  };
  const view = rows => {
    const s = q.trim().toLowerCase();
    const f = rows.filter(r => !s || [r.name, r.roll, r.email].join(' ').toLowerCase().includes(s));
    return f.sort(sort === 'date' ? (a, b) => new Date(b.createdAt) - new Date(a.createdAt) : (a, b) => b.percent - a.percent || a.rank - b.rank);
  };
  return (<>
    <PageHeader title="Reports" subtitle="Every submitted attempt, ranked per paper." />
    <Async state={state}>{rows => {
      const v = view(rows);
      const avg = v.length ? Math.round(v.reduce((s, r) => s + r.percent, 0) / v.length) : null;
      return (<>
        <div className="grid cols-3" style={{ marginBottom: 16 }}>
          <StatCard icon="checkCircle" tone="green" title="Attempts shown" value={v.length} />
          <StatCard icon="chart" tone="blue" title="Average score" value={avg === null ? '—' : avg + '%'} />
          <StatCard icon="arrowUp" tone="purple" title="Highest score" value={v.length ? Math.max(...v.map(r => r.percent)) + '%' : '—'} />
        </div>
        <div className="card">
          <div className="toolbar">
            <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search by name, roll number or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search results" /></div>
            <select value={paper} onChange={e => setPaper(e.target.value)} aria-label="Filter by paper">
              <option value="">All papers</option>
              {(papers.data || []).map(p => <option key={p._id} value={p.code}>{p.title} ({p.code})</option>)}
            </select>
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort by">
              <option value="score">Sort: highest score</option><option value="date">Sort: newest</option>
            </select>
            <button className="ghost" disabled={!v.length} onClick={() => downloadCsv('quiz-results', v)}><Icon name="download" size={16} />CSV</button>
          </div>
          <ResultsTable rows={v} showPaper onDelete={del} {...retakes.tableProps} />
        </div>
      </>);
    }}</Async>
  </>);
}
