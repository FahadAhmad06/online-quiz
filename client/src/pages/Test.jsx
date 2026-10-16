import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import clock from '../utils/clock';
import optionLabel from '../utils/optionLabel';

export default function Test() {
  const navigate = useNavigate();
  const [T, setT] = useState(() => load('qr_test', null, sessionStorage));
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState(''), [saving, setSaving] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!T?.perQ) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [!!T]);

  const update = t => { save('qr_test', t, sessionStorage); setT(t); };
  const finish = async t => {
    if (done.current) return;
    done.current = true; setSaving(true); setErr('');
    try {
      const r = await api('/attempts/' + t.attemptId + '/submit', { method: 'POST', body: { answers: t.answers } });
      save('qr_result', r, sessionStorage); sessionStorage.removeItem('qr_test'); navigate('/result');
    } catch (e) { done.current = false; setSaving(false); setErr(e.message); }
  };
  const next = timeout => {
    if (T.idx >= T.run.length - 1) return finish(T);
    const t = { ...T, idx: T.idx + 1 };
    if (T.perQ) t.qEnd = timeout ? T.qEnd + T.perQ * 1000 : Date.now() + T.perQ * 1000;
    update(t);
  };
  useEffect(() => { if (T && T.perQ && !done.current && !err && now >= T.qEnd) next(true); });
  if (!T) return <Navigate to="/" replace />;

  const n = T.run.length, q = T.run[T.idx], sel = T.answers[T.idx], last = T.idx === n - 1;
  const r = Math.max(0, Math.ceil((T.qEnd - now) / 1000));
  return (
    <div className="card">
      {T.perQ > 0 && (
        <div className="timers">
          <div className={'timer' + (r <= 10 ? ' low' : '')}>{clock(r)}</div>
          <div className="muted">This question · {clock(r + T.perQ * (n - T.idx - 1))} left in total</div>
        </div>
      )}
      <div className="muted">Question {T.idx + 1} of {n}</div>
      <div className="bar"><i style={{ width: (T.idx + 1) / n * 100 + '%' }} /></div>
      <h2>{q.text}</h2>
      {q.options.map((o, i) => (
        <button key={i} className={'opt' + (sel === i ? ' sel' : '')} disabled={saving}
          onClick={() => update({ ...T, answers: T.answers.map((a, k) => k === T.idx ? i : a) })}>
          <span className="k">{optionLabel(i)}</span><span>{o}</span>
        </button>
      ))}
      <p className="muted">{last ? 'This is the last question.' : 'Once you click Next, or the time runs out, you cannot come back to this question.'}</p>
      <button onClick={() => next(false)} disabled={saving}>{saving ? 'Submitting…' : err ? 'Try submitting again' : last ? 'Finish test' : 'Next'}</button>
      <p className="err msg" role="alert">{err}</p>
    </div>
  );
}
