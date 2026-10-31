import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/Icon';
import load from '../../utils/load';
import api from '../../utils/api';
import downloadPdf from '../../utils/downloadPdf';
import { downloadCsvGeneric } from '../../utils/downloadCsv';
import { useToast } from '../../components/Feedback';

export default function AdminReports() {
  const toast = useToast();
  const filters = useFetch('/admin/reports/filters');
  const admin = load('qr_admin', null, sessionStorage);
  const isOwner = admin?.isSuper;

  // ── Filter state ───────────────────────────────────────────────────────────
  const [paper, setPaper] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rollInput, setRollInput] = useState('');
  const [minPercent, setMinPercent] = useState('');
  const [maxPercent, setMaxPercent] = useState('');
  const [busy, setBusy] = useState('');   // id of the currently generating report

  // ── Download helpers ───────────────────────────────────────────────────────
  const qs = () => {
    const p = new URLSearchParams();
    if (paper) p.set('paper', paper);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (minPercent) p.set('minPercent', minPercent);
    if (maxPercent) p.set('maxPercent', maxPercent);
    return p.toString() ? '?' + p.toString() : '';
  };

  const gen = async (id, path, filename) => {
    if (busy) return;
    setBusy(id);
    try {
      await downloadPdf(path, filename);
      toast.ok('Report downloaded successfully.');
    } catch (e) {
      toast.bad(e.message);
    } finally {
      setBusy('');
    }
  };

  // CSV button: fetch the exact same JSON the matching PDF route reads from, then encode it.
  const genCsv = async (id, jsonPath, filename, toRows) => {
    if (busy) return;
    setBusy(id);
    try {
      const data = await api(jsonPath);
      const { head, rows } = toRows(data);
      if (!rows.length) throw new Error('No data found for the given filters.');
      downloadCsvGeneric(filename, head, rows);
      toast.ok('CSV exported successfully.');
    } catch (e) {
      toast.bad(e.message);
    } finally {
      setBusy('');
    }
  };

  // ── Report card component ─────────────────────────────────────────────────
  const Card = ({ id, icon, title, desc, action, disabled }) => (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span className="hicon" style={{ flexShrink: 0, marginTop: 2 }}>
          <Icon name={icon} size={18} />
        </span>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>{title}</b>
          <p className="muted small-text" style={{ margin: '0 0 12px' }}>{desc}</p>
          <button
            id={id}
            className="btn"
            disabled={!!busy || disabled}
            onClick={action}
            style={{ gap: 6 }}
          >
            {busy === id
              ? <><span className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />Generating…</>
              : <><Icon name="download" size={14} />Download PDF</>
            }
          </button>
        </div>
      </div>
    </div>
  );

  return (<>
    <PageHeader
      title="PDF Reports"
      subtitle="Generate and download professional PDF reports for quizzes and students."
    />

    {/* ── Filter bar ─────────────────────────────────────────────────────── */}
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head"><h2><span className="hicon"><Icon name="filter" size={16} /></span>Report Filters</h2></div>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Async state={filters}>
          {({ papers }) => (
            <select value={paper} onChange={e => setPaper(e.target.value)} aria-label="Filter by quiz" style={{ flex: '1 1 200px', maxWidth: 260 }}>
              <option value="">All quizzes</option>
              {papers.map(p => <option key={p._id} value={p.code}>{p.title} ({p.code})</option>)}
            </select>
          )}
        </Async>
        <div style={{ display: 'flex', gap: 8, flex: '1 1 300px' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" style={{ flex: 1 }} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To date" style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" min="0" max="100" placeholder="Min %" value={minPercent} onChange={e => setMinPercent(e.target.value)} aria-label="Minimum performance %" style={{ width: 90 }} />
          <span className="muted small-text">to</span>
          <input type="number" min="0" max="100" placeholder="Max %" value={maxPercent} onChange={e => setMaxPercent(e.target.value)} aria-label="Maximum performance %" style={{ width: 90 }} />
        </div>
        <button className="ghost" onClick={() => { setPaper(''); setFrom(''); setTo(''); setMinPercent(''); setMaxPercent(''); }}>
          <Icon name="close" size={14} />Clear
        </button>
      </div>
    </div>

    {/* ── Report sections ───────────────────────────────────────────────────── */}

    {/* Quiz reports */}
    {filters.data?.papers?.length > 0 && (
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
          Quiz Reports
        </h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {(paper
            ? filters.data.papers.filter(p => p.code === paper)
            : filters.data.papers.slice(0, 12)
          ).map(p => (
            <Card
              key={p._id}
              id={'quiz-' + p._id}
              icon="quiz"
              title={p.title}
              desc={'Code: ' + p.code + '  ·  Quiz Performance Report'}
              action={() => gen('quiz-' + p._id, '/admin/reports/quiz/' + p._id + qs(), 'Quiz_Report_' + p.code + '.pdf')}
            />
          ))}
        </div>
      </section>
    )}

    {/* All Students Consolidated Report — PDF + CSV, same filtered dataset for both */}
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
        Consolidated Reports
      </h3>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span className="hicon" style={{ flexShrink: 0, marginTop: 2 }}><Icon name="students" size={18} /></span>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>All Students Consolidated Report</b>
              <p className="muted small-text" style={{ margin: '0 0 12px' }}>
                One table with every student's total/obtained marks, percentage and grade.{' '}
                {isOwner ? 'Covers every teacher platform-wide; filter by quiz, date or performance above.' : 'Scoped to your own students; filter by quiz, date or performance above.'}
              </p>
              <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <button className="btn" disabled={!!busy} onClick={() => gen('consolidated-pdf', '/admin/reports/students-consolidated/pdf' + qs(), 'Consolidated_Students_Report.pdf')} style={{ gap: 6 }}>
                  {busy === 'consolidated-pdf' ? 'Generating…' : <><Icon name="download" size={14} />PDF</>}
                </button>
                <button className="ghost" disabled={!!busy} onClick={() => genCsv('consolidated-csv', '/admin/reports/students-consolidated' + qs(), 'Consolidated_Students_Report.csv',
                  data => ({
                    head: ['Student Name', 'Email', 'Teacher', 'Total Marks', 'Obtained Marks', 'Percentage', 'Grade'],
                    rows: data.rows.map(r => [r.name, r.email, r.teacherName || '', r.totalMarks, r.obtainedMarks, r.percentage, r.grade])
                  }))} style={{ gap: 6 }}>
                  {busy === 'consolidated-csv' ? 'Generating…' : <><Icon name="download" size={14} />CSV</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Bulk student reports */}
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
        Student Reports
      </h3>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>

        <Card
          id="all-students"
          icon="students"
          title="All Students Report"
          desc="Combined PDF with all students' results for your quizzes. Includes score summary and per-quiz breakdown."
          action={() => gen('all-students', '/admin/reports/all-students' + qs(), 'All_Students_Report.pdf')}
        />

        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span className="hicon" style={{ flexShrink: 0, marginTop: 2 }}>
              <Icon name="students" size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>Selected Students Report</b>
              <p className="muted small-text" style={{ margin: '0 0 8px' }}>
                Enter roll numbers (comma-separated) to generate a combined report.
              </p>
              <input
                type="text"
                placeholder="e.g. ROLL001, ROLL002"
                value={rollInput}
                onChange={e => setRollInput(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
                aria-label="Roll numbers for selected students report"
              />
              <button
                id="selected-students"
                className="btn"
                disabled={!!busy || !rollInput.trim()}
                onClick={() => {
                  const rolls = rollInput.split(',').map(r => r.trim().toUpperCase()).filter(Boolean).join(',');
                  const q = qs() ? qs() + '&rolls=' + rolls : '?rolls=' + rolls;
                  gen('selected-students', '/admin/reports/selected-students' + q, 'Selected_Students_Report.pdf');
                }}
              >
                {busy === 'selected-students'
                  ? 'Generating…'
                  : <><Icon name="download" size={14} />Download PDF</>
                }
              </button>
            </div>
          </div>
        </div>

      </div>
    </section>

    {/* Individual student report */}
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
        Individual Student
      </h3>
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span className="hicon" style={{ flexShrink: 0, marginTop: 2 }}>
            <Icon name="user" size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>Individual Student Report</b>
            <p className="muted small-text" style={{ margin: '0 0 8px' }}>
              Enter one student's roll number to generate their complete quiz history.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Roll number"
                value={rollInput}
                onChange={e => setRollInput(e.target.value.toUpperCase())}
                style={{ flex: 1 }}
                aria-label="Roll number for individual student report"
              />
              <button
                id="individual-student"
                className="btn"
                disabled={!!busy || !rollInput.trim()}
                onClick={() => {
                  const roll = rollInput.trim().toUpperCase();
                  gen('individual-student', '/admin/reports/student/' + roll + qs(), 'Student_Report_' + roll + '.pdf');
                }}
              >
                {busy === 'individual-student' ? 'Generating…' : <><Icon name="download" size={14} />PDF</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Owner-only platform reports */}
    {isOwner && (
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--purple, #7c3aed)' }}>
          Platform Reports (Owner)
        </h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          <Card
            id="platform"
            icon="chart"
            title="Platform-Wide Report"
            desc="All teachers, all quizzes, all results. Includes per-teacher performance summaries."
            action={() => gen('platform', '/admin/admins-reports/platform' + qs(), 'Platform_Report.pdf')}
          />
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="hicon" style={{ flexShrink: 0, marginTop: 2 }}><Icon name="shield" size={18} /></span>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>Teachers Summary Report</b>
                <p className="muted small-text" style={{ margin: '0 0 12px' }}>
                  One row per teacher: students, quizzes, attempts and average score, for every teacher platform-wide.
                </p>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <button className="btn" disabled={!!busy} onClick={() => gen('teachers-pdf', '/admin/admins-reports/teachers-summary/pdf' + qs(), 'Teachers_Summary_Report.pdf')} style={{ gap: 6 }}>
                    {busy === 'teachers-pdf' ? 'Generating…' : <><Icon name="download" size={14} />PDF</>}
                  </button>
                  <button className="ghost" disabled={!!busy} onClick={() => genCsv('teachers-csv', '/admin/admins-reports/teachers-summary' + qs(), 'Teachers_Summary_Report.csv',
                    data => ({
                      head: ['Teacher', 'Assigned Students', 'Created Quizzes', 'Quiz Attempts', 'Average Score'],
                      rows: data.teachers.map(t => [t.displayName, t.assignedStudents, t.createdQuizzes, t.quizAttempts, t.averageScore ?? ''])
                    }))} style={{ gap: 6 }}>
                    {busy === 'teachers-csv' ? 'Generating…' : <><Icon name="download" size={14} />CSV</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    )}

    {/* Spinner keyframes (inline — no extra CSS file needed) */}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </>);
}
