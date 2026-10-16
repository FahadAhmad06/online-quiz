import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import clock from '../utils/clock';
import validEmail from '../utils/validEmail';
import remaining from '../utils/remaining';
import beginTest from '../utils/beginTest';
import Loading from '../components/Loading';

export default function Join() {
  const { code } = useParams(), navigate = useNavigate();
  const state = useFetch('/papers/' + code.toUpperCase());
  const [s, setS] = useState(() => ({ name: '', roll: '', email: '', ...load('qr_student', {}) }));
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <div className="card"><h1>{state.error}</h1><p className="muted">Check the code or link with your teacher.</p><Link className="btn ghost" to="/">Back</Link></div>;
  const p = state.data;

  const start = async () => {
    const name = s.name.trim(), roll = s.roll.trim(), email = s.email.trim().toLowerCase();
    if (!name || !roll) return setMsg('Enter your name and roll number.');
    if (!validEmail(email)) return setMsg('Enter a valid email address.');
    setBusy(true); setMsg('');
    try {
      beginTest(await api('/papers/' + p.code + '/start', { method: 'POST', body: { name, roll, email } }));
      save('qr_student', { name, roll, email }); navigate('/test');
    } catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="card">
      <h1>{p.title}</h1>
      <p className="muted">{p.count} question{p.count === 1 ? '' : 's'} · {p.perQ ? clock(p.perQ) + ' per question' : 'no time limit'} · {remaining(p)}. You can change your answer until you click Next. After that you cannot go back.</p>
      <input type="text" placeholder="Full name" value={s.name} onChange={e => setS({ ...s, name: e.target.value })} />
      <input type="text" placeholder="Roll number" value={s.roll} onChange={e => setS({ ...s, roll: e.target.value })} />
      <input type="email" placeholder="Email" value={s.email} onChange={e => setS({ ...s, email: e.target.value })} />
      <div className="row"><button onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start test'}</button><Link className="btn ghost" to="/">Back</Link></div>
      <p className="err msg">{msg}</p>
    </div>
  );
}
