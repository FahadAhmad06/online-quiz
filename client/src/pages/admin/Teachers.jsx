import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import usePaged from '../../hooks/usePaged';
import Async from '../../components/Async';
import PageHeader from '../../components/PageHeader';
import Pagination from '../../components/Pagination';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import api from '../../utils/api';
import downloadPdf from '../../utils/downloadPdf';
import { downloadCsvGeneric } from '../../utils/downloadCsv';
import { useToast } from '../../components/Feedback';

// Owner-only Teachers list: assigned-student / quiz / attempt counts, enable/disable, and bulk
// PDF/CSV export for the selected teachers. All data comes from GET /admin/admins (owner-only),
// already extended server-side with these counts in a fixed number of queries.
export default function Teachers() {
  const state = useFetch('/admin/admins'), toast = useToast(), navigate = useNavigate();
  const [q, setQ] = useState(''), [selected, setSelected] = useState(new Set()), [busy, setBusy] = useState(false);

  const admins = state.data?.admins || [];
  const s = q.trim().toLowerCase();
  const rows = admins.filter(a => !s || a.displayName.toLowerCase().includes(s));
  const pg = usePaged(rows, 20, s);

  const toggleOne = id => setSelected(set => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(set => set.size === pg.rows.length ? new Set() : new Set(pg.rows.map(a => a._id)));

  const toggleEnabled = async a => {
    setBusy(true);
    try {
      await api('/admin/admins/' + a._id + '/' + (a.isEnabled ? 'disable' : 'enable'), { method: 'POST' });
      toast.ok(a.displayName + (a.isEnabled ? ' disabled.' : ' enabled.'));
      state.reload();
    } catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const ids = () => [...selected];

  const downloadIndividualPdfs = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      for (const a of admins.filter(x => selected.has(x._id))) {
        await downloadPdf('/admin/admins-reports/admin/' + a._id, 'Teacher_Report_' + a.displayName.replace(/[^a-z0-9]/gi, '_') + '.pdf');
      }
      toast.ok('Downloaded ' + selected.size + ' teacher PDF' + (selected.size > 1 ? 's' : '') + '.');
    } catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const downloadConsolidatedPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const q = ids().length ? '?teachers=' + ids().join(',') : '';
      await downloadPdf('/admin/admins-reports/teachers-summary/pdf' + q, 'Teachers_Summary_Report.pdf');
      toast.ok('Report downloaded.');
    } catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const q = ids().length ? '?teachers=' + ids().join(',') : '';
      const data = await api('/admin/admins-reports/teachers-summary' + q);
      downloadCsvGeneric('Teachers_Summary_Report',
        ['Teacher', 'Assigned Students', 'Created Quizzes', 'Quiz Attempts', 'Average Score', 'Status'],
        data.teachers.map(t => [t.displayName, t.assignedStudents, t.createdQuizzes, t.quizAttempts, t.averageScore ?? '', t.isEnabled ? 'Active' : 'Disabled']));
      toast.ok('CSV exported.');
    } catch (e) { toast.bad(e.message); }
    setBusy(false);
  };

  return (<>
    <PageHeader title="Teachers" subtitle="Every teacher account, their assigned students and their quiz activity." />
    <div className="card">
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search by name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search teachers" /></div>
        <span className="muted small-text">{rows.length} teacher{rows.length !== 1 ? 's' : ''}</span>
        {selected.size > 0 && (
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8, marginLeft: 'auto' }}>
            <span className="badge info">{selected.size} selected</span>
            <button className="ghost small" disabled={busy} onClick={downloadIndividualPdfs}><Icon name="download" size={14} />Individual PDFs</button>
          </div>
        )}
        <button className="ghost small" disabled={busy} onClick={downloadConsolidatedPdf}><Icon name="download" size={14} />Consolidated PDF</button>
        <button className="ghost small" disabled={busy} onClick={exportCsv}><Icon name="download" size={14} />CSV</button>
      </div>
      <Async state={state}>{() => !rows.length ? (
        <EmptyState icon="shield">{admins.length ? 'No teachers match your search.' : 'No teacher accounts yet. Add one from Settings.'}</EmptyState>
      ) : (<>
        <div className="wrapx"><table>
          <thead><tr>
            <th><input type="checkbox" checked={selected.size === pg.rows.length && pg.rows.length > 0} onChange={toggleAll} aria-label="Select all on this page" /></th>
            <th>Teacher</th><th>Assigned Students</th><th>Created Quizzes</th><th>Quiz Attempts</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>{pg.rows.map(a => (
            <tr key={a._id}>
              <td><input type="checkbox" checked={selected.has(a._id)} onChange={() => toggleOne(a._id)} aria-label={'Select ' + a.displayName} /></td>
              <td style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/teachers/' + a._id)}>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                  <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{a.displayName[0]?.toUpperCase()}</span>
                  <b className="link">{a.displayName}</b>
                </div>
              </td>
              <td>{a.assignedStudents}</td>
              <td>{a.createdQuizzes}</td>
              <td>{a.quizAttempts}</td>
              <td>{a.isEnabled ? <span className="badge ok"><Icon name="checkCircle" />Active</span> : <span className="badge bad"><Icon name="lock" />Disabled</span>}</td>
              <td><div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                <button className="outline small" onClick={() => navigate('/admin/teachers/' + a._id)}>View profile</button>
                <button className="ghost small" disabled={busy} onClick={() => toggleEnabled(a)}>{a.isEnabled ? 'Disable' : 'Enable'}</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
        <Pagination {...pg} />
      </>)}</Async>
    </div>
  </>);
}
