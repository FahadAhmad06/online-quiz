import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';
import StatCard from '../../components/StatCard';
import ResultsTable from '../../components/ResultsTable';
import Icon from '../../components/Icon';
import downloadPdf from '../../utils/downloadPdf';
import { downloadCsvGeneric } from '../../utils/downloadCsv';
import { useToast } from '../../components/Feedback';

// Student Profile — reachable from the Owner's global Students page (no ?teacherId) or from a
// Teacher Profile's assigned-students list (?teacherId=... shows the "Back to Teacher" breadcrumb
// and is also re-verified on the backend, so a hand-edited URL can't pair a student with a
// teacher they aren't actually assigned to).
export default function StudentProfile() {
  const { roll } = useParams();
  const [sp] = useSearchParams();
  const teacherId = sp.get('teacherId');
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const path = '/admin/students/' + roll + (teacherId ? '?teacherId=' + teacherId : '');
  const state = useFetch(path);

  const downloadResultPdf = async () => {
    if (busy) return;
    setBusy(true);
    try { await downloadPdf('/admin/reports/student/' + roll, 'Student_Report_' + roll + '.pdf'); toast.ok('Report downloaded.'); }
    catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const exportCsv = () => {
    const results = state.data?.results || [];
    downloadCsvGeneric('Student_Report_' + roll,
      ['Quiz', 'Code', 'Marks', 'Total', 'Wrong', 'Score %', 'Date'],
      results.map(r => [r.paperTitle, r.paperCode, r.correct, r.total, r.wrong, r.percent, new Date(r.createdAt).toISOString()]));
    toast.ok('CSV exported.');
  };

  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />;
  if (!state.data) return <Loading />;
  const d = state.data, results = d.results || [];
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.percent, 0) / results.length) : null;
  const best = results.length ? Math.max(...results.map(r => r.percent)) : null;

  return (<>
    <PageHeader title={d.name} subtitle={'Roll ' + d.roll + (d.teacher ? '  ·  Teacher: ' + d.teacher.name : '')}>
      {teacherId
        ? <Link className="btn ghost" to={'/admin/teachers/' + teacherId}><Icon name="chevronLeft" size={16} />Back to Teacher Profile</Link>
        : <Link className="btn ghost" to="/admin/students"><Icon name="chevronLeft" size={16} />All students</Link>}
      <button className="btn" disabled={busy} onClick={downloadResultPdf}><Icon name="download" size={14} />PDF</button>
      <button className="ghost" disabled={!results.length} onClick={exportCsv}><Icon name="download" size={14} />CSV</button>
    </PageHeader>

    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      <StatCard icon="quiz" tone="purple" title="Quizzes Taken" value={results.length} />
      <StatCard icon="chart" tone="blue" title="Average Score" value={avg === null ? '—' : avg + '%'} />
      <StatCard icon="checkCircle" tone="green" title="Best Score" value={best === null ? '—' : best + '%'} />
      <StatCard icon="calendar" tone="amber" title="Registered" value={d.registeredAt ? new Date(d.registeredAt).toLocaleDateString() : '—'} />
    </div>

    <div className="card">
      <div className="card-head"><h2><span className="hicon"><Icon name="report" size={16} /></span>Quiz History</h2></div>
      <ResultsTable rows={results} showPaper />
    </div>
  </>);
}
