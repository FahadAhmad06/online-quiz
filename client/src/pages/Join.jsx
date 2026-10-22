import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import api from '../utils/api';
import clock from '../utils/clock';
import remaining from '../utils/remaining';
import beginTest from '../utils/beginTest';
import duration from '../utils/duration';
import Loading from '../components/Loading';
import Icon from '../components/Icon';
import { Alert } from '../components/AuthLayout';

// Days / hours / minutes / seconds until `t`, for the segmented countdown.
function parts(t) {
  const s = Math.max(0, Math.ceil((new Date(t).getTime() - Date.now()) / 1000));
  return [['Days', Math.floor(s / 86400)], ['Hours', Math.floor(s % 86400 / 3600)], ['Minutes', Math.floor(s % 3600 / 60)], ['Seconds', s % 60]];
}

export default function Join() {
  const { code } = useParams(), navigate = useNavigate();
  const state = useFetch('/papers/' + code.toUpperCase());
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const p = state.data;
  const notStarted = p?.startsAt && new Date(p.startsAt).getTime() > Date.now();
  // A timed, scheduled paper has one fixed window for first attempts: startsAt + whole-test duration.
  const windowEnd = p?.startsAt && p.perQ ? new Date(p.startsAt).getTime() + p.perQ * p.count * 1000 : null;
  const inWindow = !notStarted && windowEnd && Date.now() < windowEnd;
  useEffect(() => {
    if (!notStarted && !inWindow) return;
    // The browser clock only drives this display; the server re-checks startsAt on every /start call.
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [notStarted, inWindow]);

  if (state.loading && !state.data) return <div className="card"><Loading label="Loading paper…" /></div>;
  if (state.error) return (
    <div className="card center-card fade-up">
      <span className="ic red big-ic"><Icon name="alert" size={26} /></span>
      <h1>{state.error}</h1>
      <p className="muted">Check the code or link with your teacher.</p>
      <div className="row" style={{ justifyContent: 'center' }}><Link className="btn" to="/dashboard">My dashboard</Link><Link className="btn ghost" to="/">Home</Link></div>
    </div>
  );

  const start = async () => {
    setBusy(true); setMsg('');
    try { beginTest(await api('/papers/' + p.code + '/start', { method: 'POST' })); navigate('/test'); }
    catch (e) { setMsg(e.message); setBusy(false); state.reload(); }
  };
  const rules = [
    ['lock', 'One question at a time', 'You can change your answer until you click Next. After that the question is locked and you cannot go back, even if you skipped it.'],
    ['clock', 'One timer for the whole test', p.perQ ? 'Time you save on one question carries over to the rest.' + (windowEnd ? ' For this scheduled paper the timer starts at the scheduled time for everyone.' : '') : 'This paper has no time limit.'],
    ['checkCircle', 'Answers save automatically', 'Your choice is saved as you pick it. Refreshing or reconnecting picks up where you left off.'],
    ['file', 'Automatic submission', p.perQ ? 'When time runs out the test is submitted with the answers you saved.' : 'Submit when you finish the last question.']
  ];

  return (<div className="fade-up">
    <div className="paper-hero">
      <span className="eyebrow"><Icon name="quiz" size={14} />Paper {p.code}</span>
      <h1>{p.title}</h1>
      <div className="chips">
        <span className="chip"><Icon name="file" size={15} />{p.count} question{p.count === 1 ? '' : 's'}</span>
        <span className="chip"><Icon name="clock" size={15} />{p.perQ ? duration(p) + ' total' : 'No time limit'}</span>
        <span className="chip"><Icon name="calendar" size={15} />{p.startsAt ? 'Starts ' + new Date(p.startsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Open now'}</span>
        <span className="chip"><Icon name="lock" size={15} />{remaining(p)}</span>
      </div>
    </div>

    {notStarted && (
      <div className="card countdown-card">
        <p className="muted" style={{ margin: '0 0 12px' }}>Exam starts in</p>
        <div className="cd-boxes" role="timer" aria-label={'Exam starts in ' + parts(p.startsAt).map(([l, v]) => v + ' ' + l).join(', ')}>
          {parts(p.startsAt).map(([l, v]) => (l !== 'Days' || v > 0) && (
            <div className="cd-box" key={l}><b>{String(v).padStart(2, '0')}</b><span>{l}</span></div>
          ))}
        </div>
        {windowEnd && <p className="muted small-text" style={{ margin: '12px 0 0' }}>The exam timer starts at the scheduled time for everyone, even if you start later.</p>}
      </div>
    )}
    {inWindow && (
      <div className="notice"><Icon name="clock" size={16} />
        <span>This exam started at {new Date(p.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. About <b>{clock(Math.ceil((windowEnd - Date.now()) / 1000))}</b> of the scheduled time is left. Your timer counts from the scheduled start, not from when you click Start.</span>
      </div>
    )}

    <div className="card">
      <div className="card-head"><h2><span className="hicon"><Icon name="info" size={16} /></span>Before you start</h2></div>
      <ul className="rules">
        {rules.map(([icon, t, d]) => <li key={t}><span className="ic soft"><Icon name={icon} size={18} /></span><div><b>{t}</b><p className="muted">{d}</p></div></li>)}
      </ul>
      <Alert>{msg}</Alert>
      <div className="row start-row">
        <button className="lg" onClick={start} disabled={busy || notStarted}>
          {busy ? <><span className="spinner" />Starting…</> : notStarted ? <><Icon name="clock" size={18} />Not started yet</> : <>Start / continue test<Icon name="chevronRight" size={18} /></>}
        </button>
        <Link className="btn ghost lg" to="/dashboard">Back</Link>
      </div>
    </div>
  </div>);
}
