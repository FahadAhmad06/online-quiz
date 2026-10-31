import { Fragment, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import usePaged from '../../hooks/usePaged';
import PageHeader from '../../components/PageHeader';
import Pagination from '../../components/Pagination';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import Icon from '../../components/Icon';
import api from '../../utils/api';
import downloadPdf from '../../utils/downloadPdf';
import { downloadCsvGeneric } from '../../utils/downloadCsv';
import { useToast } from '../../components/Feedback';

// Owner-only Teacher Profile: this teacher's own stats plus every student assigned to them
// (same roll+result merge Students.jsx already does, scoped to one teacher via the existing
// /admin/admins/:id/* owner drill-down routes). Search/page live in the URL so a student profile
// opened from here can link straight back with the same list state.
export default function TeacherProfile() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const info = useFetch('/admin/admins/' + id + '/stats');
  const rolls = useFetch('/admin/admins/' + id + '/rolls');
  const results = useFetch('/admin/admins/' + id + '/results');
  const papers = useFetch('/admin/admins/' + id + '/papers');

  const [q, setQ] = useState(sp.get('q') || '');
  const onSearch = v => { setQ(v); const next = new URLSearchParams(sp); v ? next.set('q', v) : next.delete('q'); setSp(next, { replace: true }); };

  const byRoll = {};
  (results.data || []).forEach(r => (byRoll[r.roll] = byRoll[r.roll] || []).push(r));
  const students = (rolls.data || []).filter(a => a.isRegistered && a.registeredStudent).map(a => {
    const rs = byRoll[a.rollNumber] || [];
    return {
      id: a._id, name: a.registeredStudent.name, roll: a.rollNumber, enabled: a.isEnabled, results: rs,
      avg: rs.length ? Math.round(rs.reduce((t, r) => t + r.percent, 0) / rs.length) : null,
      last: rs.reduce((m, r) => (!m || new Date(r.createdAt) > new Date(m) ? r.createdAt : m), null)
    };
  }).sort((a, b) => a.roll.localeCompare(b.roll));
  const s = q.trim().toLowerCase();
  const rows = students.filter(x => !s || (x.name + ' ' + x.roll).toLowerCase().includes(s));
  const pg = usePaged(rows, 20, s);

  const studentLink = roll => '/admin/students/' + roll + '?teacherId=' + id;
  const quizLink = paperId => '/admin/papers/' + paperId + '?teacherId=' + id;

  const downloadQuizPdf = async (paperId, code) => {
    if (busy) return;
    setBusy(true);
    try { await downloadPdf('/admin/admins-reports/quiz/' + paperId, 'Quiz_Report_' + code + '.pdf'); toast.ok('Report downloaded.'); }
    catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const downloadTeacherPdf = async () => {
    if (busy) return;
    setBusy(true);
    try { await downloadPdf('/admin/admins-reports/admin/' + id, 'Teacher_Report_' + id + '.pdf'); toast.ok('Report downloaded.'); }
    catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api('/admin/admins-reports/students-consolidated?teachers=' + id);
      if (!data.rows.length) throw new Error('No student data found for this teacher.');
      downloadCsvGeneric('Teacher_Students_Report',
        ['Student Name', 'Email', 'Total Marks', 'Obtained Marks', 'Percentage', 'Grade'],
        data.rows.map(r => [r.name, r.email, r.totalMarks, r.obtainedMarks, r.percentage, r.grade]));
      toast.ok('CSV exported.');
    } catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  if (info.error) return <ErrorBox message={info.error} onRetry={info.reload} />;
  if (!info.data) return <Loading />;
  const d = info.data;

  return (<>
    <PageHeader title={d.admin.displayName} subtitle={'Teacher since ' + new Date(d.admin.createdAt).toLocaleDateString()}>
      <Link className="btn ghost" to="/admin/teachers"><Icon name="chevronLeft" size={16} />All teachers</Link>
      <button className="btn" disabled={busy} onClick={downloadTeacherPdf}><Icon name="download" size={14} />PDF</button>
      <button className="ghost" disabled={busy} onClick={exportCsv}><Icon name="download" size={14} />CSV</button>
    </PageHeader>

    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      <StatCard icon="students" tone="purple" title="Assigned Students" value={d.rollNumbers} />
      <StatCard icon="quiz" tone="blue" title="Created Quizzes" value={d.papers} />
      <StatCard icon="checkCircle" tone="green" title="Quiz Attempts" value={d.results} />
      <StatCard icon="clock" tone="amber" title="Pending Retakes" value={d.pendingRetakes} />
    </div>

    <div className="card">
      <div className="card-head"><h2><span className="hicon"><Icon name="quiz" size={16} /></span>Created Quizzes</h2></div>
      {papers.error ? <ErrorBox message={papers.error} onRetry={papers.reload} />
        : !papers.data ? <Loading />
        : !papers.data.length ? <EmptyState icon="quiz">No quizzes created by this teacher yet.</EmptyState>
        : (
          <div className="wrapx"><table>
            <thead><tr><th>Quiz</th><th>Code</th><th>Total Marks</th><th>Questions</th><th>Created</th><th>Status</th><th>Attempts</th><th>Actions</th></tr></thead>
            <tbody>{papers.data.map(pp => (
              <tr key={pp._id}>
                <td><Link className="link" to={quizLink(pp._id)}><b>{pp.title}</b></Link></td>
                <td>{pp.code}</td>
                <td>{pp.totalMarks}</td>
                <td>{pp.questionCount}</td>
                <td className="muted small-text">{new Date(pp.createdAt).toLocaleDateString()}</td>
                <td><StatusBadge paper={pp} /></td>
                <td>{pp.submissions}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <Link className="btn outline small" to={quizLink(pp._id)}>View</Link>
                  <button className="ghost small" disabled={busy} onClick={() => downloadQuizPdf(pp._id, pp.code)}><Icon name="download" size={13} />PDF</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
    </div>

    <div className="card">
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search by name or roll number" value={q} onChange={e => onSearch(e.target.value)} aria-label="Search assigned students" /></div>
        <span className="muted small-text">{students.length} assigned</span>
      </div>
      {rolls.error || results.error ? <ErrorBox message={rolls.error || results.error} onRetry={() => { rolls.reload(); results.reload(); }} />
        : !rolls.data || !results.data ? <Loading />
        : !rows.length ? <EmptyState icon="students">{students.length ? 'No students match your search.' : 'No students assigned to this teacher yet.'}</EmptyState>
        : (<>
          <div className="wrapx"><table>
            <thead><tr><th>Student</th><th>Roll no.</th><th>Attempts</th><th>Average</th><th>Last attempt</th><th>Actions</th></tr></thead>
            <tbody>{pg.rows.map(x => (
              <tr key={x.id}>
                <td><Link className="link" to={studentLink(x.roll)}><div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}><span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{x.name[0]?.toUpperCase()}</span><b>{x.name}</b></div></Link></td>
                <td>{x.roll}{!x.enabled && <> <span className="badge bad" title="Roll number disabled for new registrations"><Icon name="lock" />Roll disabled</span></>}</td>
                <td>{x.results.length}</td>
                <td>{x.avg === null ? <span className="muted">—</span> : x.avg + '%'}</td>
                <td className="muted small-text">{x.last ? new Date(x.last).toLocaleString() : '—'}</td>
                <td><Link className="btn outline small" to={studentLink(x.roll)}>View profile</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pagination {...pg} />
        </>)}
    </div>
  </>);
}
