import { useState } from 'react';
import optionLabel from '../utils/optionLabel';

export default function QuestionBuilder({ questions, onChange }) {
  const [text, setText] = useState(''), [opts, setOpts] = useState(['', '']), [corr, setCorr] = useState(0), [msg, setMsg] = useState('');
  const add = () => {
    if (!text.trim() || opts.some(o => !o.trim())) return setMsg('Fill in the question and every option.');
    onChange([...questions, { text: text.trim(), options: opts.map(o => o.trim()), correct: corr }]);
    setText(''); setOpts(['', '']); setCorr(0); setMsg('');
  };
  const removeOpt = i => { setOpts(opts.filter((_, k) => k !== i)); setCorr(c => c >= opts.length - 1 ? 0 : c > i ? c - 1 : c); };
  return (<>
    <h2 style={{ marginTop: 18 }}>Questions ({questions.length})</h2>
    {questions.map((q, i) => (
      <div className="qrow" key={i}>
        <div><b>{i + 1}. {q.text}</b><div className="muted">Correct: {optionLabel(q.correct)}) {q.options[q.correct]}</div></div>
        <button className="danger" onClick={() => onChange(questions.filter((_, k) => k !== i))}>Delete</button>
      </div>
    ))}
    <div style={{ marginTop: 12 }}>
      <p className="muted">Up to 4 options. Select the radio button next to the correct one.</p>
      <textarea placeholder="Type the question" value={text} onChange={e => setText(e.target.value)} />
      {opts.map((o, i) => (
        <div className="optedit" key={i}>
          <input type="radio" name="corr" checked={corr === i} onChange={() => setCorr(i)} aria-label={'Correct option ' + optionLabel(i)} />
          <input type="text" placeholder={'Option ' + optionLabel(i)} value={o} onChange={e => setOpts(opts.map((x, k) => k === i ? e.target.value : x))} />
          {opts.length > 2 && <button className="danger" style={{ marginBottom: 10 }} onClick={() => removeOpt(i)}>Remove</button>}
        </div>
      ))}
      <div className="row">
        {opts.length < 4 && <button className="ghost" onClick={() => setOpts([...opts, ''])}>Add option</button>}
        <button className="ghost" onClick={add}>Add question to paper</button>
      </div>
      <p className="muted msg">{msg}</p>
    </div>
  </>);
}
