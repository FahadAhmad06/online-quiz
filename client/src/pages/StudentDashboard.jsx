import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import Async from '../components/Async';
import load from '../utils/load';

export default function StudentDashboard() {
  const s = load('qr_student', null, sessionStorage);
  const state = useFetch('/me/overview');
  const [code, setCode] = useState(''), navigate = useNavigate();
  const open = () => { const c = code.trim().split('/').pop().toUpperCase(); if (c) navigate('/join/' + c); };

  return (<>
    <h1>Welcome back, {s?.name || 'student'}</h1>
    <p className="muted">Roll number {s?.rollNumber}</p>

    <div className="card">
      <h2>Have a paper code?</h2>
      <input type="text" placeholder="Paper code" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && open()} />
      <button onClick={open}>Open paper</button>
    </div>

    <Async state={state}>{d => (<>
      {d.inProgress.length > 0 && (
        <div className="card elevated">
          <h2>Continue an exam</h2>
          {d.inProgress.map(a => (
            <div className="qrow" key={a.paperCode}>
              <div><b>{a.paperTitle}</b><div className="muted">Code {a.paperCode} · started {new Date(a.startedAt).toLocaleString()}</div></div>
              <Link className="btn" to={'/join/' + a.paperCode}>Continue</Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-3" style={{ marginBottom: '24px' }}>
        <div className="stat"><div className="n">{d.completed}</div><div className="l">Completed exams</div></div>
        <div className="stat"><div className="n">{d.averagePercent === null ? '—' : d.averagePercent + '%'}</div><div className="l">Average score</div></div>
        <div className="stat"><div className="n">{d.latest ? d.latest.correct + '/' + d.latest.total : '—'}</div><div className="l">Latest result</div></div>
      </div>

      <div className="card">
        <h2>Recent results</h2>
        {!d.results.length && <div className="empty"><div className="icon">📄</div>No exams completed yet. Enter a paper code above to get started.</div>}
        {d.results.slice(0, 10).map(r => (
          <div className="qrow" key={r._id}>
            <div><b>{r.paperTitle}</b><div className="muted">{new Date(r.createdAt).toLocaleString()}</div></div>
            <div><b>{r.correct}/{r.total}</b> <span className="muted">({Math.round(r.correct / r.total * 100)}%)</span></div>
          </div>
        ))}
      </div>
    </>)}</Async>
  </>);
}