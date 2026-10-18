import { useState } from 'react';
import QuestionBuilder from './QuestionBuilder';
import UNIT from '../utils/units';
export default function PaperForm({ onSubmit }) {
  const [f, setF] = useState({ title: '', min: '1', shuf: true, dur: '24', unit: 'hours', never: false });
  const [questions, setQuestions] = useState([]), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => {
    const min = parseFloat(f.min), dur = parseFloat(f.dur);
    if (!f.title.trim()) return setMsg('Give the paper a title.');
    if (isNaN(min) || min < 0 || min > 60) return setMsg('Minutes per question must be from 0 to 60.');
    if (!f.never && (isNaN(dur) || dur <= 0)) return setMsg('Enter how long the link stays active.');
    if (!questions.length) return setMsg('Add at least one question.');
    setBusy(true); setMsg('');
    try { await onSubmit({ title: f.title.trim(), perQ: Math.round(min * 60), shuffle: f.shuf, durationMs: f.never ? null : dur * UNIT[f.unit], questions }); }
    catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="card">
      <input type="text" placeholder="Paper title, e.g. Introduction to Marketing quiz 1" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <div className="muted">Time per question, in minutes (0 = no limit) — multiplied by the question count, this becomes one shared countdown for the whole test. Answering early leaves its saved time for later questions.</div>
      <input type="text" inputMode="decimal" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} />
      <div className="muted">How long should the student link stay active?</div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="text" inputMode="decimal" disabled={f.never} value={f.dur} style={{ width: 90, marginBottom: 0 }} onChange={e => setF({ ...f, dur: e.target.value })} />
        <select disabled={f.never} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>
          <option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option>
        </select>
        <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={f.never} onChange={e => setF({ ...f, never: e.target.checked })} />Never expires</label>
      </div>
      <label className="chk"><input type="checkbox" checked={f.shuf} onChange={e => setF({ ...f, shuf: e.target.checked })} />Shuffle questions and options for each student</label>
      <QuestionBuilder questions={questions} onChange={setQuestions} />
      <button onClick={submit} disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Creating…' : 'Create paper and link'}</button>
      <p className="err msg">{msg}</p>
    </div>
  );
}
