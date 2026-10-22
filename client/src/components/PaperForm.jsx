import { useState } from 'react';
import QuestionBuilder from './QuestionBuilder';
import UNIT from '../utils/units';
import Icon from './Icon';

// Create mode (no `initial`) also sets link lifetime and schedule; edit mode only changes content and
// timing per question — link expiry and start time are managed on the paper page, as before.
export default function PaperForm({ onSubmit, initial, submitLabel }) {
  const edit = !!initial;
  const [f, setF] = useState(() => ({
    title: initial?.title || '', min: initial ? String(initial.perQ / 60) : '1', shuf: initial ? initial.shuffle : true,
    dur: '24', unit: 'hours', never: false, schedule: false, startsAt: ''
  }));
  const [questions, setQuestions] = useState(initial?.questions || []), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => {
    const min = parseFloat(f.min), dur = parseFloat(f.dur);
    if (!f.title.trim()) return setMsg('Give the paper a title.');
    if (isNaN(min) || min < 0 || min > 60) return setMsg('Minutes per question must be from 0 to 60.');
    if (!edit && !f.never && (isNaN(dur) || dur <= 0)) return setMsg('Enter how long the link stays active.');
    if (!edit && f.schedule && !f.startsAt) return setMsg('Pick a start date and time, or turn scheduling off.');
    if (!questions.length) return setMsg('Add at least one question.');
    setBusy(true); setMsg('');
    try {
      await onSubmit(edit
        ? { title: f.title.trim(), perQ: Math.round(min * 60), shuffle: f.shuf, questions }
        : {
          title: f.title.trim(), perQ: Math.round(min * 60), shuffle: f.shuf,
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
      <label className="field" htmlFor="pf-min">Time per question, in minutes (0 = no limit)</label>
      <input id="pf-min" type="text" inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} style={{ maxWidth: 200 }} />
      <p className="muted small-text" style={{ marginTop: -6 }}>Multiplied by the question count, this becomes one shared countdown for the whole test. Answering early leaves its saved time for later questions. For a scheduled paper the countdown starts at the scheduled time.</p>
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
