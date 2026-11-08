import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import load from '../utils/load';
import save from '../utils/save';
import optionLabel from '../utils/optionLabel';
import Icon from '../components/Icon';
import ExamTimer from '../components/ExamTimer';
import QuestionNavigator from '../components/QuestionNavigator';
import AnswerEditor from '../components/AnswerEditor';
import { ConfirmDialog, useToast } from '../components/Feedback';
import usePoll, { POLL_SLOW } from '../hooks/usePoll';

// Strict sequential exam, with one exception: subjective answers already reached stay revisable.
// - idx is the server's frontier - the furthest-reached question - and only ever moves forward.
// - MCQ: choosing an option autosaves it (PATCH /answer); Next locks it via PATCH /step; no way back.
// - Subjective: autosaves the same way, but Previous/Next can walk back and forth across any run
//   of already-reached subjective questions to revise them, right up until submit.
// - `view` is what's on screen; it trails `idx` while revising, and snaps back to `idx` (the live
//   question) whenever the frontier actually advances.
// - Any request naming a locked/future question gets 409 + the real state, which we adopt.
export default function Test() {
  const navigate = useNavigate();
  const [T, setT] = useState(() => load('qr_test', null, sessionStorage));
  const [view, setView] = useState(() => T?.idx ?? 0);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error (autosave of the viewed question)
  const [confirming, setConfirming] = useState(false);
  const [violationAlert, setViolationAlert] = useState(null);
  const toast = useToast();
  const done = useRef(false), queue = useRef(Promise.resolve()), Tref = useRef(T), viewRef = useRef(view), lastStatus = useRef(null);
  Tref.current = T; viewRef.current = view;

  const statusPoll = usePoll(T?.attemptId ? '/attempts/' + T.attemptId : null, d => {
    if (d?.examStatus === 'suspended') return POLL_SLOW;
    return null;
  });

  const update = t => { save('qr_test', t, sessionStorage); Tref.current = t; setT(t); };
  // Adopt the server's progress (from GET, step, answer, or a 409 body). Never moves backwards.
  // Always follows the frontier: this only runs on mount-resync or a successful advance, both of
  // which should bring the display to the newly-reached question.
  const adopt = p => {
    const cur = Tref.current;
    if (!cur || cur.idx > p.idx) return;
    const answers = p.idx === cur.idx && cur.answers[cur.idx] >= 0 && p.answers[p.idx] < 0
      ? p.answers.map((a, i) => i === p.idx ? cur.answers[i] : a) // keep an unsaved local pick on the same question
      : p.answers;
    const serverText = p.subjectiveText || [];
    const curText = cur.subjectiveText || [];
    const subjectiveText = p.idx === cur.idx && curText[cur.idx] && curText[cur.idx] !== serverText[p.idx]
      ? serverText.map((s, i) => i === p.idx ? curText[i] : s) // keep unsaved local typing on the same question
      : serverText;
    update({
      ...cur,
      idx: p.idx,
      answers,
      subjectiveText,
      qEnd: p.qEnd ? new Date(p.qEnd).getTime() : 0,
      startedAt: p.startedAt ? new Date(p.startedAt).getTime() : cur.startedAt || null,
      skew: p.serverNow ? p.serverNow - Date.now() : cur.skew || 0
    });
    setView(p.idx);
  };
  const conflict = e => {
    if (e.status === 409 && e.data && Number.isInteger(e.data.idx)) { adopt(e.data); setNotice(e.data.error || 'Your progress was updated from the server.'); return true; }
    return false;
  };

  // Resync with the server once on mount: a refresh or reopened tab resumes at the server's idx and deadline.
  useEffect(() => { if (T) api('/attempts/' + T.attemptId).then(adopt).catch(() => {}); }, []);

  useEffect(() => {
    if (!T?.attemptId) return;
    if (statusPoll.data && statusPoll.data.examStatus === 'suspended') {
      if (lastStatus.current !== 'suspended') {
        toast.bad('Your examination has been suspended because you exceeded the allowed tab-switch limit. Please contact your teacher or administrator.');
        lastStatus.current = 'suspended';
      }
      setViolationAlert('Your examination has been suspended because you exceeded the allowed tab-switch limit. Please contact your teacher or administrator.');
      setNotice('');
      setErr('');
      setT(t => ({ ...t, examStatus: 'suspended', suspensionReason: statusPoll.data.suspensionReason || t.suspensionReason || 'Your examination has been suspended because you exceeded the allowed tab-switch limit. Please contact your teacher or administrator.' }));
      return;
    }
    if (statusPoll.data && statusPoll.data.examStatus === 'in_progress') {
      if (lastStatus.current !== 'in_progress') {
        toast.ok('Your examination has been resumed. You may continue where you left off.');
        lastStatus.current = 'in_progress';
      }
      setViolationAlert(null);
      setNotice('Your examination has been resumed. You may continue where you left off.');
      setT(t => ({ ...t, examStatus: 'in_progress', suspensionReason: null, qEnd: t.qEnd || (statusPoll.data.qEnd ? new Date(statusPoll.data.qEnd).getTime() : t.qEnd) }));
    }
  }, [statusPoll.data, T?.attemptId, toast]);

  useEffect(() => {
    if (!T?.qEnd) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [!!T]);

  // Warn before leaving while a save is in flight (progress itself is safe on the server either way).
  useEffect(() => {
    const h = e => { if (saveState === 'saving' || saving) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h);
  }, [saveState, saving]);

  useEffect(() => {
    const onVisibility = () => {
      if (!T || done.current || T.examStatus === 'suspended') return;
      if (document.visibilityState === 'hidden') {
        api('/attempts/' + T.attemptId + '/violation', { method: 'POST' }).then(r => {
          setT(t => ({ ...t, tabSwitchCount: r.tabSwitchCount || 0, examStatus: r.examStatus || t.examStatus, suspensionReason: r.suspensionReason || t.suspensionReason }));
          const nextCount = Math.min((r.tabSwitchCount || 0), tabSwitchLimit);
          const currentWarning = `${nextCount}/${tabSwitchLimit}`;
          if (r.alert === 'warning') {
            toast.bad(`Tab switch warning ${currentWarning}. Remaining ${formatClock(remainingMs)} left out of ${formatClock(totalDurationMs)} total.`);
            setNotice(`Tab switch warning ${currentWarning}. Remaining ${formatClock(remainingMs)} left out of ${formatClock(totalDurationMs)} total.`);
          }
          if (r.alert === 'final_warning') {
            toast.bad(`Final warning: ${currentWarning}. Another tab switch will suspend this examination. Remaining ${formatClock(remainingMs)} left out of ${formatClock(totalDurationMs)} total.`);
            setNotice(`Final warning: ${currentWarning}. Another tab switch will suspend this examination. Remaining ${formatClock(remainingMs)} left out of ${formatClock(totalDurationMs)} total.`);
          }
          if (r.alert === 'suspended') {
            toast.bad(`Tab switch limit reached: ${currentWarning}. Examination suspended. Remaining ${formatClock(remainingMs)} left out of ${formatClock(totalDurationMs)} total.`);
            setViolationAlert('Your examination has been suspended because you exceeded the allowed tab-switch limit. Please contact your teacher or administrator.');
            setNotice('');
            setErr('');
          }
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onVisibility); };
  }, [T?.attemptId, T?.examStatus, toast]);

  const currentAnswer = t => t.run[t.idx].type === 'subjective' ? (t.subjectiveText[t.idx] || '') : t.answers[t.idx];
  const formatClock = ms => {
    const abs = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    return h > 0 ? [h, m, s].map(v => String(v).padStart(2, '0')).join(':') : [m, s].map(v => String(v).padStart(2, '0')).join(':');
  };
  const tabSwitchLimit = 3;

  const finish = async t => {
    if (done.current) return;
    done.current = true; setConfirming(false); setSaving(true); setErr('');
    flushSubjective();
    try {
      await queue.current;
      const r = await api('/attempts/' + t.attemptId + '/submit', { method: 'POST', body: { answer: currentAnswer(t) } });
      save('qr_result', r, sessionStorage); sessionStorage.removeItem('qr_test'); navigate('/result');
    } catch (e) { done.current = false; setSaving(false); setErr(e.message); }
  };

  // Saves are chained so they reach the server in the order they were made. MCQ can only ever be
  // chosen on the live frontier question, so this always targets T.idx (unchanged from before).
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

  // Subjective text autosaves on a short debounce instead of every keystroke; it targets whatever
  // question is on screen (`view`), which may trail the frontier while revising an earlier answer.
  // Debounces are tracked per question (not one shared timer) - revising question A, navigating
  // away, then editing question B within A's debounce window must not cancel A's pending save.
  // flushSubjective() fires every pending save immediately; Next/Finish both call it first so a
  // revision made moments ago is never left behind when submitting.
  const subjTimers = useRef({}); // idx -> { handle, run }
  const flushSubjective = () => { Object.values(subjTimers.current).forEach(p => { clearTimeout(p.handle); p.run(); }); subjTimers.current = {}; };
  const chooseText = value => {
    if (saving || done.current) return;
    const idx = viewRef.current;
    const t = { ...Tref.current, subjectiveText: Tref.current.subjectiveText.map((s, k) => k === idx ? value : s) };
    update(t); setNotice('');
    setSaveState('saving');
    const run = () => {
      delete subjTimers.current[idx];
      queue.current = queue.current.then(() => api('/attempts/' + t.attemptId + '/answer', { method: 'PATCH', body: { idx, answer: value } }))
        .then(() => { if (viewRef.current === idx) setSaveState('saved'); })
        .catch(e => { if (!conflict(e)) setSaveState('error'); else setSaveState('idle'); });
    };
    if (subjTimers.current[idx]) clearTimeout(subjTimers.current[idx].handle);
    subjTimers.current[idx] = { handle: setTimeout(run, 1200), run };
  };

  // Moving on early never resets or shortens the shared pool — only the actual time used is gone.
  // On any failure we stay on this question (nothing is locked unless the server confirmed it).
  const next = async () => {
    if (saving || done.current) return;
    if (T.idx >= T.run.length - 1) return setConfirming(true);
    setSaving(true); setErr(''); setNotice('');
    flushSubjective();
    try {
      await queue.current;
      const cur = Tref.current;
      const r = await api('/attempts/' + cur.attemptId + '/step', { method: 'PATCH', body: { idx: cur.idx, answer: currentAnswer(cur) } });
      adopt(r); setSaveState('idle');
    } catch (e) { if (!conflict(e)) setErr(e.message); }
    setSaving(false);
  };

  // The pool running out ends the whole test (auto-submit, no confirmation), from whatever question.
  const serverNow = now + (T?.skew || 0);
  useEffect(() => { if (T && T.qEnd && !done.current && !saving && !err && serverNow >= T.qEnd) finish(T); });
  // Keyboard shortcut: A–D or 1–4 picks an option (same path as clicking). Next is never keyboard-triggered,
  // so a stray key can't lock a question. Only live when the viewed question is the MCQ frontier -
  // you can never be viewing an MCQ that isn't the frontier (Previous only ever lands on subjective).
  useEffect(() => {
    const key = e => {
      if (!T || confirming || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (view !== T.idx || T.run[T.idx].type === 'subjective') return;
      const k = e.key.toLowerCase(), i = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : '1234'.indexOf(k);
      if (i >= 0 && i < T.run[T.idx].options.length && !(T.qEnd && serverNow >= T.qEnd)) choose(i);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  });
  if (!T) return <Navigate to="/" replace />;

  if (T.examStatus === 'suspended' || violationAlert) {
    return (
      <div className="exam fade-up">
        <div className="card exam-card" style={{ padding: 32, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>Examination suspended</h2>
          <p className="muted" style={{ maxWidth: 620, margin: '0 auto 12px auto', lineHeight: 1.6 }}>
            {T.suspensionReason || violationAlert || 'Your examination has been suspended because you exceeded the allowed tab-switch limit. Please contact your teacher or administrator.'}
          </p>
          <p className="muted small-text">Teacher or owner approval is required before you can continue this examination.</p>
        </div>
      </div>
    );
  }

  const n = T.run.length, q = T.run[view], sel = T.answers[view], atFrontier = view === T.idx, frontierLast = T.idx === n - 1;
  const subjective = q.type === 'subjective';
  const totalDurationMs = T.startedAt && T.qEnd ? Math.max(0, T.qEnd - T.startedAt) : (T.customDuration ? T.customDuration * 1000 : (T.perQ && T.run.length ? T.perQ * T.run.length * 1000 : 0));
  const remainingMs = T.qEnd ? Math.max(0, T.qEnd - serverNow) : 0;
  const r = Math.max(0, Math.ceil((T.qEnd - serverNow) / 1000));
  const expired = !!T.qEnd && serverNow >= T.qEnd;
  const tabSwitchCount = T.tabSwitchCount || 0;
  const unanswered = T.run.reduce((n2, qq, i) => n2 + ((qq.type === 'subjective' ? !!(T.subjectiveText[i] || '').trim() : T.answers[i] >= 0) ? 0 : 1), 0);
  const canGoPrev = subjective && view > 0 && T.run[view - 1].type === 'subjective';
  const goPrev = () => { if (canGoPrev && !saving && !done.current) setView(v => v - 1); };
  const goNext = () => {
    if (saving || done.current) return;
    if (!atFrontier) return setView(v => Math.min(v + 1, T.idx)); // pure local navigation, already reached
    expired ? finish(T) : next();
  };
  return (
    <div className="exam fade-up">
      <div className="exam-bar">
        <div className="exam-head">
          <div>
            {T.preview && <span className="badge info" style={{ marginBottom: 6 }}><Icon name="eye" />Admin preview</span>}
            <h2 style={{ margin: 0 }}>Question {view + 1} <span className="muted" style={{ fontWeight: 500 }}>of {n}</span></h2>
            <span className="muted small-text">{T.idx} locked · {n - T.idx - 1} to go</span>
          </div>
          {!!T.qEnd && <ExamTimer remaining={r} />}
        </div>
        <div className="bar" aria-hidden="true"><i style={{ width: (T.idx + 1) / n * 100 + '%' }} /></div>
      </div>

      <div className="card exam-card">
      <QuestionNavigator count={n} idx={T.idx} view={view} answers={T.answers} run={T.run} subjectiveText={T.subjectiveText} />

      <div className="qcard">
        <span className="qlabel">Question {view + 1}{subjective && <span className="badge info" style={{ marginLeft: 8 }}>{q.maxMarks} marks</span>}{!atFrontier && <span className="badge warn" style={{ marginLeft: 8 }}>Revising</span>}</span>
        <h2 className="qtext">{q.text}</h2>
        {subjective ? (<>
          {q.instructions && <p className="muted small-text" style={{ marginTop: -6 }}>{q.instructions}</p>}
          <AnswerEditor value={T.subjectiveText[view] || ''} onChange={chooseText} disabled={saving || expired} />
        </>) : (<>
          <div role="radiogroup" aria-label={'Options for question ' + (view + 1)}>
            {q.options.map((o, i) => (
              <button key={i} role="radio" aria-checked={sel === i} className={'opt' + (sel === i ? ' sel' : '')} disabled={saving || expired}
                onClick={() => choose(i)}>
                <span className="k">{optionLabel(i)}</span><span>{o}</span>{sel === i && <span className="check"><Icon name="checkCircle" size={18} /></span>}
              </button>
            ))}
          </div>
          <p className="muted small-text kbd-hint">Tip: press <kbd>A</kbd>–<kbd>{optionLabel(q.options.length - 1)}</kbd> to choose an option.</p>
        </>)}
      </div>

      <div className="row exam-actions">
        <span className={'save-state' + (saveState === 'error' ? ' bad' : '')} aria-live="polite">
          {saveState === 'saving' && <><span className="spinner" />Saving your answer…</>}
          {saveState === 'saved' && <><Icon name="check" size={15} />Answer saved</>}
          {saveState === 'error' && <><Icon name="alert" size={15} />Not saved yet. It will be sent again shortly.</>}
        </span>
        <div className="row" style={{ gap: 8 }}>
          {canGoPrev && <button className="ghost lg" onClick={goPrev} disabled={saving}><Icon name="chevronLeft" size={16} />Previous</button>}
          <button className="lg" onClick={goNext} disabled={saving}>
            {saving ? <><span className="spinner" />{(atFrontier && frontierLast) || expired ? 'Submitting…' : 'Saving…'}</>
              : err ? 'Try again' : !atFrontier ? <>Next<Icon name="chevronRight" size={16} /></> : frontierLast ? 'Finish test' : <>Next<Icon name="chevronRight" size={16} /></>}
          </button>
        </div>
      </div>
      <div className="notice warn">
        <Icon name="lock" size={16} />
        <span>
          {!atFrontier ? 'You are revising an earlier answer. Use Next to return to where you left off.'
            : frontierLast ? 'This is the last question. Finishing submits the whole test.'
            : subjective ? 'Subjective answers can be revised with Previous/Next until you submit the test.'
            : <>Once you click <b>Next</b>, this question is locked{sel >= 0 ? '' : ' as skipped'} and you cannot come back to it. Time saved by answering early stays available for the rest of the test.</>}
        </span>
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
