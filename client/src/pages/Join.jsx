import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import api from '../utils/api';
import clock from '../utils/clock';
import remaining from '../utils/remaining';
import beginTest from '../utils/beginTest';
import Loading from '../components/Loading';

export default function Join() {
  const { code } = useParams(), navigate = useNavigate();
  const state = useFetch('/papers/' + code.toUpperCase());
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <div className="card"><h1>{state.error}</h1><p className="muted">Check the code or link with your teacher.</p><Link className="btn ghost" to="/">Back</Link></div>;
  const p = state.data;

  const start = async () => {
    setBusy(true); setMsg('');
    try { beginTest(await api('/papers/' + p.code + '/start', { method: 'POST' })); navigate('/test'); }
    catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="card">
      <h1>{p.title}</h1>
      <p className="muted">{p.count} question{p.count === 1 ? '' : 's'} · {p.perQ ? clock(p.perQ * p.count) + ' total for the whole test' : 'no time limit'} · {remaining(p)}. You can change your answer until you click Next. After that you cannot go back.</p>
      <div className="row"><button onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start test'}</button><Link className="btn ghost" to="/">Back</Link></div>
      <p className="err msg">{msg}</p>
    </div>
  );
}
