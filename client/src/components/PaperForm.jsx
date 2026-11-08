import { useState } from 'react';
import QuestionBuilder from './QuestionBuilder';
import UNIT from '../utils/units';
import Icon from './Icon';

const formatDuration = sec => {
  const total = Math.max(0, Math.round(sec || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const pieces = [];
  if (hours) pieces.push(hours + ' hour' + (hours === 1 ? '' : 's'));
  if (minutes || !pieces.length) pieces.push(minutes + ' minute' + (minutes === 1 ? '' : 's'));
  return pieces.join(' ');
};

// Create mode (no `initial`) also sets link lifetime and schedule; edit mode only changes content and
// timing per question — link expiry and start time are managed on the paper page, as before.
export default function PaperForm({ onSubmit, initial, submitLabel }) {
  const edit = !!initial;
  const initialMode = initial?.timingMode === 'customTotal' ? 'customTotal' : 'perQuestion';
  const initialCustomSec = Number(initial?.customDuration) || 0;
  const [f, setF] = useState(() => ({
    title: initial?.title || '', min: initial ? String(initial.perQ / 60) : '1', shuf: initial ? initial.shuffle : true,
    timingMode: initialMode, customHours: String(Math.floor(initialCustomSec / 3600)), customMinutes: String(Math.floor((initialCustomSec % 3600) / 60)),
    dur: '24', unit: 'hours', never: false, schedule: false, startsAt: ''
  }));
  const [questions, setQuestions] = useState(initial?.questions || []), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const customDurationSeconds = Math.max(0, (Number(f.customHours) || 0) * 3600 + (Number(f.customMinutes) || 0) * 60);
  const totalQuestionSeconds = Math.max(0, Number(f.min || 0) * 60 * Math.max(1, questions.length));
  const submit = async () => {
    const min = parseFloat(f.min), dur = parseFloat(f.dur);
    const mode = f.timingMode === 'customTotal' ? 'customTotal' : 'perQuestion';
    const customDuration = mode === 'customTotal' ? customDurationSeconds : 0;
    if (!f.title.trim()) return setMsg('Give the paper a title.');
    if (isNaN(min) || min < 0 || min > 60) return setMsg('Minutes per question must be from 0 to 60.');
    if (mode === 'customTotal' && customDuration <= 0) return setMsg('Enter a custom exam duration greater than zero.');
    if (!edit && !f.never && (isNaN(dur) || dur <= 0)) return setMsg('Enter how long the link stays active.');
    if (!edit && f.schedule && !f.startsAt) return setMsg('Pick a start date and time, or turn scheduling off.');
    if (!questions.length) return setMsg('Add at least one question.');
    setBusy(true); setMsg('');
    try {
      await onSubmit(edit
        ? { title: f.title.trim(), perQ: Math.round(min * 60), timingMode: mode, customDuration, shuffle: f.shuf, questions }
        : {
          title: f.title.trim(), perQ: Math.round(min * 60), timingMode: mode, customDuration, shuffle: f.shuf,
          durationMs: f.never ? null : dur * UNIT[f.unit],
          startsAt: f.schedule && f.startsAt ? new Date(f.startsAt).toISOString() : null,
          questions
        });
    } catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (<>
    <div className="card">
      <div className="card-head"><h2><span className="hicon"><Icon name="settings" size={16} /></span>Quiz settings</h2></div>
      <label className="field" htmlFor="pf-title">Title</label>
      <input id="pf-title" type="text" placeholder="e.g. Introduction to Marketing quiz 1" value={f.title} maxLength={120} onChange={e => setF({ ...f, title: e.target.value })} />

      <div className="field" style={{ marginBottom: 8 }}><b>Exam timing</b></div>
      <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <label className="chk" style={{ margin: 0 }}><input type="radio" name="timingMode" checked={f.timingMode === 'perQuestion'} onChange={() => setF({ ...f, timingMode: 'perQuestion' })} />Per-question timing</label>
        <label className="chk" style={{ margin: 0 }}><input type="radio" name="timingMode" checked={f.timingMode === 'customTotal'} onChange={() => setF({ ...f, timingMode: 'customTotal' })} />Custom total exam duration</label>
      </div>

      {f.timingMode === 'perQuestion' ? (<>
        <label className="field" htmlFor="pf-min">Time per question, in minutes (0 = no limit)</label>
        <input id="pf-min" type="text" inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} style={{ maxWidth: 200 }} />
        <p className="muted small-text" style={{ marginTop: -6 }}>
          Total exam duration: {formatDuration(totalQuestionSeconds)} ({questions.length} questions × {f.min || '0'} minutes).
        </p>
      </>) : (<>
        <label className="field" htmlFor="pf-hours">Custom total duration</label>
        <div className="row" style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="small-text muted" htmlFor="pf-hours">Hours</label>
            <input id="pf-hours" type="text" inputMode="numeric" value={f.customHours} onChange={e => setF({ ...f, customHours: e.target.value })} style={{ width: 90, marginBottom: 0 }} />
          </div>
          <div>
            <label className="small-text muted" htmlFor="pf-minutes">Minutes</label>
            <input id="pf-minutes" type="text" inputMode="numeric" value={f.customMinutes} onChange={e => setF({ ...f, customMinutes: e.target.value })} style={{ width: 90, marginBottom: 0 }} />
          </div>
        </div>
        <p className="muted small-text" style={{ marginTop: -6 }}>Final total exam duration: {formatDuration(customDurationSeconds)}.</p>
      </>)}

      {!edit && (<>
        <label className="field">How long should the student link stay active?</label>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="text" inputMode="decimal" disabled={f.never} value={f.dur} style={{ width: 90, marginBottom: 0 }} onChange={e => setF({ ...f, dur: e.target.value })} aria-label="Link duration" />
          <select disabled={f.never} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} style={{ width: 'auto', marginBottom: 0 }} aria-label="Link duration unit">
            <option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option>
          </select>
          <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={f.never} onChange={e => setF({ ...f, never: e.target.checked })} />Never expires</label>
        </div>
      </>)}
      <label className="chk"><input type="checkbox" checked={f.shuf} onChange={e => setF({ ...f, shuf: e.target.checked })} />Shuffle questions and options for each student</label>
      {!edit && (<>
        <label className="chk"><input type="checkbox" checked={f.schedule} onChange={e => setF({ ...f, schedule: e.target.checked })} />Schedule a start time (students can't begin before this)</label>
        {f.schedule && <input type="datetime-local" value={f.startsAt} onChange={e => setF({ ...f, startsAt: e.target.value })} style={{ maxWidth: 280 }} aria-label="Start time" />}
      </>)}
    </div>
    <div className="card">
      <QuestionBuilder questions={questions} onChange={setQuestions} />
    </div>
    <div className="row">
      <button onClick={submit} disabled={busy}>{busy ? <><span className="spinner" />Saving…</> : submitLabel || 'Create paper and link'}</button>
      {msg && <p className="err" role="alert" style={{ margin: 0 }}>{msg}</p>}
    </div>
  </>);
}
