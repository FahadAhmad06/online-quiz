import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import optionLabel from '../utils/optionLabel';
import Icon from '../components/Icon';
import ExamTimer from '../components/ExamTimer';
import QuestionNavigator from '../components/QuestionNavigator';
import { ConfirmDialog } from '../components/Feedback';

// Strict sequential exam. The server owns idx (the only answerable question), answers and the deadline:
// - choosing an option autosaves it for the current question (PATCH /answer), so a refresh keeps it;
// - Next saves the final choice and locks the question (PATCH /step); there is no way back;
// - any request naming a locked/future question gets 409 + the real state, which we adopt.
export default function Test() {
  const navigate = useNavigate();
  const [T, setT] = useState(() => load('qr_test', null, sessionStorage));
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error (autosave of the current choice)
  const [confirming, setConfirming] = useState(false);
  const done = useRef(false), queue = useRef(Promise.resolve()), Tref = useRef(T);
  Tref.current = T;

  const update = t => { save('qr_test', t, sessionStorage); Tref.current = t; setT(t); };
  // Adopt the server's progress (from GET, step, answer, or a 409 body). Never moves backwards.
  const adopt = p => {
    const cur = Tref.current;
    if (!cur || cur.idx > p.idx) return;
    const answers = p.idx === cur.idx && cur.answers[cur.idx] >= 0 && p.answers[p.idx] < 0
      ? p.answers.map((a, i) => i === p.idx ? cur.answers[i] : a) // keep an unsaved local pick on the same question
      : p.answers;
    update({ ...cur, idx: p.idx, answers, qEnd: p.qEnd ? new Date(p.qEnd).getTime() : 0, skew: p.serverNow ? p.serverNow - Date.now() : cur.skew || 0 });
  };
  const conflict = e => {
    if (e.status === 409 && e.data && Number.isInteger(e.data.idx)) { adopt(e.data); setNotice(e.data.error || 'Your progress was updated from the server.'); return true; }
    return false;
  };

  // Resync with the server once on mount: a refresh or reopened tab resumes at the server's idx and deadline.
  useEffect(() => { if (T) api('/attempts/' + T.attemptId).then(adopt).catch(() => {}); }, []);

  useEffect(() => {
    if (!T?.perQ) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [!!T]);

  // Warn before leaving while a save is in flight (progress itself is safe on the server either way).
  useEffect(() => {
    const h = e => { if (saveState === 'saving' || saving) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h);
  }, [saveState, saving]);

  const finish = async t => {
    if (done.current) return;
    done.current = true; setConfirming(false); setSaving(true); setErr('');
    try {
      await queue.current;
      const r = await api('/attempts/' + t.attemptId + '/submit', { method: 'POST', body: { answer: t.answers[t.idx] } });
      save('qr_result', r, sessionStorage); sessionStorage.removeItem('qr_test'); navigate('/result');
    } catch (e) { done.current = false; setSaving(false); setErr(e.message); }
  };

  // Saves are chained so they reach the server in the order they were made.
  const choose = i => {
    if (saving || done.current) return;
    const t = { ...T, answers: T.answers.map((a, k) => k === T.idx ? i : a) };
    update(t); setNotice('');
    const idx = t.idx;
    setSaveState('saving');
    queue.current = queue.current.then(() => api('/attempts/' + t.attemptId + '/answer', { method: 'PATCH', body: { idx, answer: i } }))
      .then(() => { if (Tref.current?.idx === idx) setSaveState('saved'); })
      .catch(e => { if (!conflict(e)) setSaveState('error'); else setSaveState('idle'); });
  };

  // Moving on early never resets or shortens the shared pool — only the actual time used is gone.
  // On any failure we stay on this question (nothing is locked unless the server confirmed it).
  const next = async () => {
    if (saving || done.current) return;
    if (T.idx >= T.run.length - 1) return setConfirming(true);
    setSaving(true); setErr(''); setNotice('');
    try {
      await queue.current;
      const cur = Tref.current;
      const r = await api('/attempts/' + cur.attemptId + '/step', { method: 'PATCH', body: { idx: cur.idx, answer: cur.answers[cur.idx] } });
      adopt(r); setSaveState('idle');
    } catch (e) { if (!conflict(e)) setErr(e.message); }
    setSaving(false);
  };

  // The pool running out ends the whole test (auto-submit, no confirmation), from whatever question.
  const serverNow = now + (T?.skew || 0);
  useEffect(() => { if (T && T.perQ && !done.current && !saving && !err && serverNow >= T.qEnd) finish(T); });
  // Keyboard shortcut: A–D or 1–4 picks an option (same path as clicking). Next is never keyboard-triggered,
  // so a stray key can't lock a question.
  useEffect(() => {
    const key = e => {
      if (!T || confirming || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase(), i = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : '1234'.indexOf(k);
      if (i >= 0 && i < T.run[T.idx].options.length && !(T.perQ && serverNow >= T.qEnd)) choose(i);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  });
  if (!T) return <Navigate to="/" replace />;

  const n = T.run.length, q = T.run[T.idx], sel = T.answers[T.idx], last = T.idx === n - 1;
  const r = Math.max(0, Math.ceil((T.qEnd - serverNow) / 1000));
  const expired = T.perQ && serverNow >= T.qEnd;
  const unanswered = T.answers.filter(a => a < 0).length;
  return (
    <div className="exam fade-up">
      <div className="exam-bar">
        <div className="exam-head">
          <div>
            {T.preview && <span className="badge info" style={{ marginBottom: 6 }}><Icon name="eye" />Admin preview</span>}
            <h2 style={{ margin: 0 }}>Question {T.idx + 1} <span className="muted" style={{ fontWeight: 500 }}>of {n}</span></h2>
            <span className="muted small-text">{T.idx} locked · {n - T.idx - 1} to go</span>
          </div>
          {T.perQ > 0 && <ExamTimer remaining={r} />}
        </div>
        <div className="bar" aria-hidden="true"><i style={{ width: (T.idx + 1) / n * 100 + '%' }} /></div>
      </div>

      <div className="card exam-card">
      <QuestionNavigator count={n} idx={T.idx} answers={T.answers} />

      <div className="qcard">
        <span className="qlabel">Question {T.idx + 1}</span>
        <h2 className="qtext">{q.text}</h2>
        <div role="radiogroup" aria-label={'Options for question ' + (T.idx + 1)}>
          {q.options.map((o, i) => (
            <button key={i} role="radio" aria-checked={sel === i} className={'opt' + (sel === i ? ' sel' : '')} disabled={saving || expired}
              onClick={() => choose(i)}>
              <span className="k">{optionLabel(i)}</span><span>{o}</span>{sel === i && <span className="check"><Icon name="checkCircle" size={18} /></span>}
            </button>
          ))}
        </div>
        <p className="muted small-text kbd-hint">Tip: press <kbd>A</kbd>–<kbd>{optionLabel(q.options.length - 1)}</kbd> to choose an option.</p>
      </div>

      <div className="row exam-actions">
        <span className={'save-state' + (saveState === 'error' ? ' bad' : '')} aria-live="polite">
          {saveState === 'saving' && <><span className="spinner" />Saving your answer…</>}
          {saveState === 'saved' && <><Icon name="check" size={15} />Answer saved</>}
          {saveState === 'error' && <><Icon name="alert" size={15} />Not saved yet. It will be sent again when you click {last ? 'Finish' : 'Next'}.</>}
        </span>
        <button className="lg" onClick={() => (expired ? finish(T) : next())} disabled={saving}>
          {saving ? <><span className="spinner" />{last || expired ? 'Submitting…' : 'Saving…'}</> : err ? 'Try again' : last ? 'Finish test' : <>Next<Icon name="chevronRight" size={16} /></>}
        </button>
      </div>
      <div className="notice warn">
        <Icon name="lock" size={16} />
        <span>{last ? 'This is the last question. Finishing submits the whole test.' : <>Once you click <b>Next</b>, this question is locked{sel >= 0 ? '' : ' as skipped'} and you cannot come back to it. Time saved by answering early stays available for the rest of the test.</>}</span>
      </div>
      {notice && <p className="notice" role="status"><Icon name="info" size={16} />{notice}</p>}
      <p className="err msg" role="alert">{err}</p>

      {confirming && !done.current && (
        <ConfirmDialog title="Submit your test?"
          message={(unanswered ? unanswered + ' question' + (unanswered === 1 ? ' is' : 's are') + ' unanswered. ' : 'All questions answered. ') + 'After submitting you cannot change any answer.'}
          confirmText="Submit test" cancelText="Not yet" onClose={ok => (ok ? finish(Tref.current) : setConfirming(false))} />
      )}
      </div>
    </div>
  );
}
