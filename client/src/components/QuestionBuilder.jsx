import { useState } from 'react';
import optionLabel from '../utils/optionLabel';
import Icon from './Icon';

export default function QuestionBuilder({ questions, onChange }) {
  const [text, setText] = useState(''), [opts, setOpts] = useState(['', '']), [corr, setCorr] = useState(0), [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null); // index being edited, or null when adding
  const reset = () => { setText(''); setOpts(['', '']); setCorr(0); setMsg(''); setEditing(null); };
  const add = () => {
    if (!text.trim() || opts.some(o => !o.trim())) return setMsg('Fill in the question and every option.');
    const q = { text: text.trim(), options: opts.map(o => o.trim()), correct: corr };
    onChange(editing === null ? [...questions, q] : questions.map((x, k) => k === editing ? q : x));
    reset();
  };
  const startEdit = i => { const q = questions[i]; setText(q.text); setOpts([...q.options]); setCorr(q.correct); setEditing(i); setMsg(''); };
  const remove = i => { onChange(questions.filter((_, k) => k !== i)); if (editing === i) reset(); else if (editing > i) setEditing(editing - 1); };
  const removeOpt = i => { setOpts(opts.filter((_, k) => k !== i)); setCorr(c => c >= opts.length - 1 ? 0 : c > i ? c - 1 : c); };
  return (<>
    <div className="card-head"><h2><span className="hicon"><Icon name="quiz" size={16} /></span>Questions ({questions.length})</h2></div>
    {questions.map((q, i) => (
      <div className="qrow" key={i} style={editing === i ? { background: 'var(--accent-soft)', borderRadius: 10, padding: 12 } : undefined}>
        <div><b>{i + 1}. {q.text}</b><div className="muted small-text">Correct: {optionLabel(q.correct)}) {q.options[q.correct]}</div></div>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
          <button className="ghost small" onClick={() => startEdit(i)} aria-label={'Edit question ' + (i + 1)}><Icon name="edit" size={15} />Edit</button>
          <button className="danger" onClick={() => remove(i)} aria-label={'Delete question ' + (i + 1)}><Icon name="trash" size={15} /></button>
        </div>
      </div>
    ))}
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <h3>{editing === null ? 'Add a question' : 'Edit question ' + (editing + 1)}</h3>
      <p className="muted small-text">Up to 4 options. Select the radio button next to the correct one.</p>
      <textarea placeholder="Type the question" value={text} onChange={e => setText(e.target.value)} aria-label="Question text" />
      {opts.map((o, i) => (
        <div className="optedit" key={i}>
          <input type="radio" name="corr" checked={corr === i} onChange={() => setCorr(i)} aria-label={'Correct option ' + optionLabel(i)} />
          <input type="text" placeholder={'Option ' + optionLabel(i)} value={o} onChange={e => setOpts(opts.map((x, k) => k === i ? e.target.value : x))} />
          {opts.length > 2 && <button className="danger" style={{ marginBottom: 10 }} onClick={() => removeOpt(i)} aria-label={'Remove option ' + optionLabel(i)}><Icon name="close" size={15} /></button>}
        </div>
      ))}
      <div className="row">
        {opts.length < 4 && <button className="ghost" onClick={() => setOpts([...opts, ''])}><Icon name="plus" size={16} />Add option</button>}
        <button className="outline" onClick={add}>{editing === null ? 'Add question to paper' : 'Save question'}</button>
        {editing !== null && <button className="ghost" onClick={reset}>Cancel edit</button>}
      </div>
      <p className="err msg">{msg}</p>
    </div>
  </>);
}
