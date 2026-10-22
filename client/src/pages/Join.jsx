import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import api from '../utils/api';
import clock from '../utils/clock';
import remaining from '../utils/remaining';
import beginTest from '../utils/beginTest';
import Loading from '../components/Loading';

function startCountdown(startsAt) {
  const ms = new Date(startsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 3600) return clock(totalSec); // mm:ss once it's close
  const m = Math.ceil(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
  return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + (m % 60) + 'm';
}

export default function Join() {
  const { code } = useParams(), navigate = useNavigate();
  const state = useFetch('/papers/' + code.toUpperCase());
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const p = state.data;
  const notStarted = p?.startsAt && new Date(p.startsAt).getTime() > Date.now();
  useEffect(() => {
    if (!notStarted) return;
    // The browser clock only drives this display; the server re-checks startsAt on every /start call.
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [notStarted]);

  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <div className="card"><h1>{state.error}</h1><p className="muted">Check the code or link with your teacher.</p><Link className="btn ghost" to="/">Back</Link></div>;

  const start = async () => {
    setBusy(true); setMsg('');
    try { beginTest(await api('/papers/' + p.code + '/start', { method: 'POST' })); navigate('/test'); }
    catch (e) { setMsg(e.message); setBusy(false); state.reload(); }
  };
  const countdown = notStarted ? startCountdown(p.startsAt) : null;

  return (
    <div className="card">
      <h1>{p.title}</h1>
      <p className="muted">{p.count} question{p.count === 1 ? '' : 's'} · {p.perQ ? clock(p.perQ * p.count) + ' total for the whole test' : 'no time limit'} · {remaining(p)}. You can change your answer until you click Next. After that you cannot go back.</p>
      {countdown && (
        <div className="card elevated" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ margin: '0 0 6px' }}>Exam starts in</p>
          <div className="countdown">{countdown}</div>
        </div>
      )}
      <div className="row">
        <button onClick={start} disabled={busy || notStarted}>{busy ? 'Starting…' : notStarted ? 'Not started yet' : 'Start test'}</button>
        <Link className="btn ghost" to="/">Back</Link>
      </div>
      <p className="err msg">{msg}</p>
    </div>
  );
}
