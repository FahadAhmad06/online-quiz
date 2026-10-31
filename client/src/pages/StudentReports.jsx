// StudentReports.jsx — "My Reports" page for students.
// Students can view all their completed quiz results and download individual PDF reports.
// Only the logged-in student's own reports are ever shown (enforced server-side too).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import load from '../utils/load';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import ErrorBox from '../components/ErrorBox';
import { useToast } from '../components/Feedback';
import { downloadCsvGeneric } from '../utils/downloadCsv';
import downloadFile from '../utils/downloadPdf';

const pctOf = r => r.total ? Math.round((r.correct / r.total) * 100) : 0;

function gradeLabel(p) {
  if (p >= 85) return { label: 'Excellent', color: 'var(--green, #16a34a)',  bg: 'var(--green-light, #dcfce7)' };
  if (p >= 70) return { label: 'Good',      color: 'var(--green, #16a34a)',  bg: 'var(--green-light, #dcfce7)' };
  if (p >= 50) return { label: 'Pass',      color: 'var(--indigo, #4f46e5)', bg: 'var(--indigo-light, #e0e7ff)' };
  return             { label: 'Fail',       color: 'var(--red, #dc2626)',    bg: 'var(--red-light, #fee2e2)' };
}

/** Stream a PDF from the student's own report endpoint, download it. */
const downloadResultPdf = (resultId, filename) => downloadFile('/me/reports/' + resultId + '/pdf', filename, 'qr_student');

export default function StudentReports() {
  const toast   = useToast();
  const s       = load('qr_student', null, sessionStorage);
  const state   = useFetch('/me/reports');
  const reports = state.data || [];

  const [busy,    setBusy]    = useState('');
  const [search,  setSearch]  = useState('');
  const [sortBy,  setSortBy]  = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const toggleSort = field => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const filtered = reports
    .filter(r => !search.trim() ||
      r.paperTitle?.toLowerCase().includes(search.toLowerCase()) ||
      r.paperCode?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if      (sortBy === 'score') cmp = pctOf(a) - pctOf(b);
      else if (sortBy === 'title') cmp = (a.paperTitle || '').localeCompare(b.paperTitle || '');
      else                         cmp = new Date(a.createdAt) - new Date(b.createdAt);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const download = async r => {
    if (busy) return;
    setBusy(r._id);
    try {
      const safe = (r.paperTitle || r.paperCode || 'report').replace(/[^a-z0-9]/gi, '_');
      await downloadResultPdf(r._id, 'QuizRoom_Report_' + safe + '.pdf');
      toast.ok('Report downloaded.');
    } catch (e) {
      toast.bad(e.message);
    } finally {
      setBusy('');
    }
  };

  const SortIcon = ({ field }) => sortBy !== field ? null
    : <Icon name={sortDir === 'asc' ? 'arrowUp' : 'chevronDown'} size={12} style={{ marginLeft: 3, opacity: .7 }} />;

  const completed = reports.length;
  const avgPct    = completed ? Math.round(reports.reduce((s, r) => s + pctOf(r), 0) / completed) : null;
  const bestPct   = completed ? Math.max(...reports.map(pctOf)) : null;

  const exportCsv = () => {
    const head = ['Quiz', 'Code', 'Marks', 'Total', 'Score %', 'Grade', 'Date'];
    const rows = reports.map(r => {
      const p = pctOf(r);
      return [r.paperTitle, r.paperCode, r.correct, r.total, p, gradeLabel(p).label, new Date(r.createdAt).toISOString()];
    });
    downloadCsvGeneric('My_Quiz_Reports', head, rows);
    toast.ok('CSV exported.');
  };

  return (<>
    {/* Page heading */}
    <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="avatar lg"><Icon name="report" size={22} /></span>
        <div>
          <h1 style={{ margin: 0 }}>My Quiz Reports</h1>
          <p className="muted small-text" style={{ margin: 0 }}>
            {s?.name && <><b>{s.name}</b> · </>}Roll {s?.rollNumber} · Download PDF reports for all your completed exams
          </p>
        </div>
      </div>
      <Link className="btn ghost" to="/dashboard" style={{ gap: 6 }}>
        <Icon name="chevronLeft" size={16} /> Dashboard
      </Link>
    </section>

    {/* Stat cards */}
    <div className="grid cols-3" style={{ marginBottom: 16 }}>
      {state.loading
        ? [0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 16 }} />)
        : (<>
            <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '18px 20px' }}>
              <span className="hicon"><Icon name="file" size={20} /></span>
              <div>
                <div className="muted small-text" style={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, fontSize: 11 }}>Completed Exams</div>
                <b style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--purple)' }}>{completed}</b>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '18px 20px' }}>
              <span className="hicon" style={avgPct !== null && avgPct < 50 ? { background: 'var(--red-light, #fee2e2)', color: 'var(--red)' } : {}}>
                <Icon name="chart" size={20} />
              </span>
              <div>
                <div className="muted small-text" style={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, fontSize: 11 }}>Average Score</div>
                <b style={{ fontSize: 30, lineHeight: 1.1, color: avgPct === null ? 'var(--muted)' : avgPct >= 50 ? 'var(--green)' : 'var(--red)' }}>
                  {avgPct !== null ? avgPct + '%' : '—'}
                </b>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '18px 20px' }}>
              <span className="hicon" style={{ background: 'var(--green-light, #dcfce7)', color: 'var(--green)' }}>
                <Icon name="checkCircle" size={20} />
              </span>
              <div>
                <div className="muted small-text" style={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, fontSize: 11 }}>Best Score</div>
                <b style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--green)' }}>
                  {bestPct !== null ? bestPct + '%' : '—'}
                </b>
              </div>
            </div>
          </>)
      }
    </div>

    {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}

    {/* Reports table card */}
    <div className="card">
      <div className="card-head">
        <h2><span className="hicon"><Icon name="report" size={16} /></span>All Reports</h2>
        {completed > 0 && (
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <input
              id="reports-search"
              type="search"
              placeholder="Search by quiz name or code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 240 }}
              aria-label="Search reports"
            />
            <button className="ghost" onClick={exportCsv}><Icon name="download" size={14} />Export CSV</button>
          </div>
        )}
      </div>

      {state.loading && [0, 1, 2, 3].map(i =>
        <div key={i} className="skeleton" style={{ height: 54, margin: '0 0 8px' }} />
      )}

      {!state.loading && !reports.length && (
        <EmptyState icon="file">
          No completed exams yet.{' '}
          <Link to="/dashboard">Go to your dashboard</Link> and enter a paper code to get started.
        </EmptyState>
      )}

      {!state.loading && reports.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table id="student-reports-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--navy, #0f172a)' }}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>
                  <button className="link" onClick={() => toggleSort('title')} style={{ fontWeight: 700, color: '#fff', fontSize: 11 }}>
                    Quiz <SortIcon field="title" />
                  </button>
                </th>
                <th style={{ ...thStyle, textAlign: 'center' }}>
                  <button className="link" onClick={() => toggleSort('score')} style={{ fontWeight: 700, color: '#fff', fontSize: 11 }}>
                    Score <SortIcon field="score" />
                  </button>
                </th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Grade</th>
                <th style={thStyle}>
                  <button className="link" onClick={() => toggleSort('date')} style={{ fontWeight: 700, color: '#fff', fontSize: 11 }}>
                    Date <SortIcon field="date" />
                  </button>
                </th>
                <th style={{ ...thStyle, textAlign: 'center' }}>PDF Report</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--muted)' }}>
                  No results match your search.
                </td></tr>
              )}
              {filtered.map((r, i) => {
                const p = pctOf(r);
                const g = gradeLabel(p);
                return (
                  <tr key={r._id} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,.015)' : undefined }}>
                    <td style={tdStyle}><span className="muted small-text">{i + 1}</span></td>
                    <td style={tdStyle}>
                      <b style={{ display: 'block', fontSize: 14 }}>{r.paperTitle || '—'}</b>
                      <span className="muted small-text">{r.paperCode}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <b style={{ color: p >= 50 ? 'var(--green)' : 'var(--red)', display: 'block' }}>
                        {r.correct} / {r.total}
                      </b>
                      <span className="muted small-text">{p}%</span>
                      <div style={{ height: 4, background: 'var(--rule, #e2e8f0)', borderRadius: 2, marginTop: 4, width: 60, marginInline: 'auto' }}>
                        <div style={{ height: '100%', width: p + '%', background: p >= 50 ? 'var(--green)' : 'var(--red)', borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ background: g.bg, color: g.color, padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                        {g.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'block', fontWeight: 500 }}>
                        {new Date(r.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="muted small-text">
                        {new Date(r.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        id={'dl-report-' + r._id}
                        className="btn"
                        disabled={!!busy}
                        onClick={() => download(r)}
                        style={{ padding: '6px 10px', fontSize: 12, gap: 5, minWidth: 90 }}
                        aria-label={'Download PDF for ' + (r.paperTitle || r.paperCode)}
                      >
                        {busy === r._id
                          ? <><span style={spinnerStyle} />Generating</>
                          : <><Icon name="download" size={13} /> PDF</>
                        }
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!state.loading && filtered.length > 0 && (
        <div style={{ padding: '10px 16px 4px', fontSize: 12, color: 'var(--muted)' }}>
          Showing {filtered.length} of {completed} report{completed !== 1 ? 's' : ''}
          {search.trim() ? ' · filtered by "' + search + '"' : ''}
        </div>
      )}
    </div>

    <p className="muted small-text" style={{ textAlign: 'center', marginTop: 12, marginBottom: 8 }}>
      PDFs are generated in real time from official records. Only your own reports are accessible.
    </p>

    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </>);
}

const thStyle = { padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.04em' };
const tdStyle = { padding: '12px 12px', borderBottom: '1px solid var(--rule, #e2e8f0)', verticalAlign: 'middle' };
const spinnerStyle = { width: 13, height: 13, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block', verticalAlign: 'middle', marginRight: 5 };
