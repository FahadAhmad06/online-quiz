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

  // Resync with the server once on mount — it's the authority on idx/qEnd/answers, not sessionStorage.
  // Guarded against a race: if the student already advanced (via next()/finish()) before this
  // resolves, this snapshot is stale — applying it would snap the UI back to an earlier question.
  useEffect(() => {
    if (!T) return;
    const attemptId = T.attemptId;
    api('/attempts/' + attemptId).then(p => {
      setT(current => {
        if (!current || current.idx > p.idx) return current;
        const merged = { ...current, idx: p.idx, answers: p.answers, qEnd: p.qEnd ? new Date(p.qEnd).getTime() : 0 };
        save('qr_test', merged, sessionStorage);
        return merged;
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!T?.perQ) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [!!T]);

  const update = t => { save('qr_test', t, sessionStorage); setT(t); };

  // Shared time pool for the whole test: this ends it, from whatever question the student is on.
  const finish = async t => {
    if (done.current) return;
    done.current = true; setSaving(true); setErr('');
    try {
      const r = await api('/attempts/' + t.attemptId + '/submit', { method: 'POST', body: { answer: t.answers[t.idx] } });
      save('qr_result', r, sessionStorage); sessionStorage.removeItem('qr_test'); navigate('/result');
    } catch (e) { done.current = false; setSaving(false); setErr(e.message); }
  };

  // Moving on early never resets or shortens the shared pool — only the actual time used is gone.
  const next = async () => {
    if (saving || done.current) return;
    if (T.idx >= T.run.length - 1) return finish(T);
    setSaving(true); setErr('');
    try {
      const r = await api('/attempts/' + T.attemptId + '/step', { method: 'PATCH', body: { idx: T.idx, answer: T.answers[T.idx] } });
      update({ ...T, idx: r.idx, answers: r.answers, qEnd: r.qEnd ? new Date(r.qEnd).getTime() : 0 });
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };
  // The pool running out ends the whole test, not just the current question.
  useEffect(() => { if (T && T.perQ && !done.current && !saving && !err && now >= T.qEnd) finish(T); });
  if (!T) return <Navigate to="/" replace />;

  const n = T.run.length, q = T.run[T.idx], sel = T.answers[T.idx], last = T.idx === n - 1;
  const r = Math.max(0, Math.ceil((T.qEnd - now) / 1000));
  return (
    <div className="card">
      {T.perQ > 0 && (
        <div className="timers">
          <div className={'timer' + (r <= 10 ? ' low' : r <= 60 ? ' warn' : '')}>{clock(r)}</div>
          <div className="muted">left for the whole test</div>
        </div>
      )}
      <div className="muted">Question {T.idx + 1} of {n}</div>
      <div className="bar"><i style={{ width: (T.idx + 1) / n * 100 + '%' }} /></div>
      {n <= 50 && (
        <div className="qpalette">
          {T.run.map((_, i) => (
            <span key={i} className={'qpill' + (i === T.idx ? ' current' : i < T.idx ? ' done' : '')} aria-label={'Question ' + (i + 1) + (i < T.idx ? ', answered' : i === T.idx ? ', current' : '')}>{i + 1}</span>
          ))}
        </div>
      )}
      <h2>{q.text}</h2>
      {q.options.map((o, i) => (
        <button key={i} className={'opt' + (sel === i ? ' sel' : '')} disabled={saving}
          onClick={() => update({ ...T, answers: T.answers.map((a, k) => k === T.idx ? i : a) })}>
          <span className="k">{optionLabel(i)}</span><span>{o}</span>
        </button>
      ))}
      <p className="muted">{last ? 'This is the last question.' : 'Once you click Next, you cannot come back to this question. Time saved by answering early stays available for the rest of the test.'}</p>
      <button onClick={() => (T.perQ && now >= T.qEnd ? finish(T) : next())} disabled={saving}>{saving ? 'Submitting…' : err ? 'Try submitting again' : last ? 'Finish test' : 'Next'}</button>
      <p className="err msg" role="alert">{err}</p>
    </div>
  );
}
