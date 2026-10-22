import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import load from '../utils/load';
import Icon from '../components/Icon';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import ErrorBox from '../components/ErrorBox';

const pctOf = r => r.total ? Math.round(r.correct / r.total * 100) : 0;

export default function StudentDashboard() {
  const s = load('qr_student', null, sessionStorage);
  const state = useFetch('/me/overview'), d = state.data;
  const [code, setCode] = useState(''), [hint, setHint] = useState(''), [all, setAll] = useState(false), navigate = useNavigate();
  const open = e => {
    e?.preventDefault();
    const c = code.trim().split('/').pop().toUpperCase();
    if (c) navigate('/join/' + c); else setHint('Enter the paper code your teacher shared.');
  };
  const results = d ? (all ? d.results : d.results.slice(0, 10)) : [];

  return (<>
    <section className="welcome fade-up">
      <div className="welcome-who">
        <span className="avatar lg">{(s?.name || 'S')[0].toUpperCase()}</span>
        <div>
          <h1>Welcome back, {s?.name || 'student'} 👋</h1>
          <p><span className="badge info"><Icon name="user" />Roll {s?.rollNumber}</span></p>
        </div>
      </div>
      <form className="welcome-code" onSubmit={open}>
        <label className="field" htmlFor="sd-code">Have a paper code?</label>
        <div className="code-box">
          <input id="sd-code" type="text" placeholder="Enter paper code" value={code} autoComplete="off"
            onChange={e => { setCode(e.target.value); setHint(''); }} />
          <button type="submit">Open paper<Icon name="chevronRight" size={16} /></button>
        </div>
        {hint && <p className="err small-text" role="alert" style={{ margin: '6px 0 0' }}>{hint}</p>}
      </form>
    </section>

    {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}

    {d?.inProgress.length > 0 && (
      <div className="card continue">
        <div className="card-head"><h2><span className="hicon warn"><Icon name="clock" size={16} /></span>Continue an exam</h2></div>
        {d.inProgress.map(a => (
          <div className="qrow" key={a.paperCode}>
            <div><b>{a.paperTitle}</b><div className="muted small-text">Code {a.paperCode} · started {new Date(a.startedAt).toLocaleString()}</div></div>
            <Link className="btn" to={'/join/' + a.paperCode}>Continue<Icon name="chevronRight" size={16} /></Link>
          </div>
        ))}
      </div>
    )}

    <div className="grid cols-3" style={{ marginBottom: 16 }}>
      {!d ? [0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 112, borderRadius: 16 }} />) : (<>
        <StatCard icon="checkCircle" tone="green" title="Completed exams" value={d.completed} />
        <StatCard icon="chart" tone="blue" title="Average score" value={d.averagePercent === null ? '—' : d.averagePercent + '%'} />
        <StatCard icon="file" tone="purple" title="Latest result" value={d.latest ? d.latest.correct + '/' + d.latest.total : '—'}
          delta={d.latest ? d.latest.paperTitle : null} />
      </>)}
    </div>

    <div className="card">
      <div className="card-head">
        <h2><span className="hicon"><Icon name="file" size={16} /></span>Exam history</h2>
        {d && d.results.length > 10 && <button className="link" onClick={() => setAll(v => !v)}>{all ? 'Show recent' : 'Show all (' + d.results.length + ')'}</button>}
      </div>
      {!d ? [0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 52 }} />)
        : !d.results.length ? <EmptyState icon="quiz">No exams completed yet. Enter a paper code above to get started.</EmptyState>
        : <ul className="history">{results.map(r => {
            const p = pctOf(r);
            return (
              <li key={r._id}>
                <span className="ic soft"><Icon name="file" size={18} /></span>
                <div className="h-main">
                  <b>{r.paperTitle}</b>
                  <span className="muted small-text">{r.paperCode} · {new Date(r.createdAt).toLocaleString()}</span>
                  <div className="meter" aria-hidden="true"><i style={{ width: p + '%' }} /></div>
                </div>
                <div className="h-score"><b>{r.correct}/{r.total}</b><span className="muted small-text">{p}%</span></div>
              </li>
            );
          })}</ul>}
    </div>
  </>);
}
