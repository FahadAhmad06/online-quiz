import { useState } from 'react';
import optionLabel from '../utils/optionLabel';
import Icon from './Icon';

const blankMcq = { type: 'mcq', text: '', options: ['', ''], correct: 0 };
const blankSubjective = { type: 'subjective', text: '', maxMarks: '10', instructions: '', rubric: '', keyConcepts: '', modelAnswer: '' };

function summary(q) {
  if (q.type === 'subjective') return 'Subjective · ' + q.maxMarks + ' marks';
  return 'Correct: ' + optionLabel(q.correct) + ') ' + q.options[q.correct];
}

export default function QuestionBuilder({ questions, onChange }) {
  const [f, setF] = useState(blankMcq), [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null); // index being edited, or null when adding

  const reset = () => { setF(blankMcq); setMsg(''); setEditing(null); };
  const setType = type => setF(type === 'subjective' ? { ...blankSubjective, text: f.text } : { ...blankMcq, text: f.text });

  const add = () => {
    if (!f.text.trim()) return setMsg('Enter the question text.');
    let q;
    if (f.type === 'subjective') {
      const maxMarks = parseFloat(f.maxMarks);
      if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000) return setMsg('Enter maximum marks from 1 to 1000.');
      q = {
        type: 'subjective', text: f.text.trim(), maxMarks, instructions: f.instructions.trim(), rubric: f.rubric.trim(),
        keyConcepts: f.keyConcepts.split(',').map(s => s.trim()).filter(Boolean), modelAnswer: f.modelAnswer.trim()
      };
    } else {
      if (f.options.some(o => !o.trim())) return setMsg('Fill in every option.');
      q = { type: 'mcq', text: f.text.trim(), options: f.options.map(o => o.trim()), correct: f.correct };
    }
    onChange(editing === null ? [...questions, q] : questions.map((x, k) => k === editing ? q : x));
    reset();
  };
  const startEdit = i => {
    const q = questions[i];
    setF(q.type === 'subjective'
      ? { type: 'subjective', text: q.text, maxMarks: String(q.maxMarks), instructions: q.instructions || '', rubric: q.rubric || '', keyConcepts: (q.keyConcepts || []).join(', '), modelAnswer: q.modelAnswer || '' }
      : { type: 'mcq', text: q.text, options: [...q.options], correct: q.correct });
    setEditing(i); setMsg('');
  };
  const remove = i => { onChange(questions.filter((_, k) => k !== i)); if (editing === i) reset(); else if (editing > i) setEditing(editing - 1); };
  const removeOpt = i => { setF({ ...f, options: f.options.filter((_, k) => k !== i), correct: f.correct >= f.options.length - 1 ? 0 : f.correct > i ? f.correct - 1 : f.correct }); };

  return (<>
    <div className="card-head"><h2><span className="hicon"><Icon name="quiz" size={16} /></span>Questions ({questions.length})</h2></div>
    {questions.map((q, i) => (
      <div className="qrow" key={i} style={editing === i ? { background: 'var(--accent-soft)', borderRadius: 10, padding: 12 } : undefined}>
        <div>
          <b>{i + 1}. {q.text}</b>
          {q.type === 'subjective' && <span className="badge info" style={{ marginLeft: 8 }}>Subjective</span>}
          <div className="muted small-text">{summary(q)}</div>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
          <button className="ghost small" onClick={() => startEdit(i)} aria-label={'Edit question ' + (i + 1)}><Icon name="edit" size={15} />Edit</button>
          <button className="danger" onClick={() => remove(i)} aria-label={'Delete question ' + (i + 1)}><Icon name="trash" size={15} /></button>
        </div>
      </div>
    ))}
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <h3>{editing === null ? 'Add a question' : 'Edit question ' + (editing + 1)}</h3>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="chk" style={{ margin: 0 }}><input type="radio" name="qtype" checked={f.type === 'mcq'} onChange={() => setType('mcq')} />Multiple choice</label>
        <label className="chk" style={{ margin: 0 }}><input type="radio" name="qtype" checked={f.type === 'subjective'} onChange={() => setType('subjective')} />Subjective (written answer)</label>
      </div>
      <textarea placeholder="Type the question" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} aria-label="Question text" />

      {f.type === 'mcq' ? (<>
        <p className="muted small-text">Up to 4 options. Select the radio button next to the correct one.</p>
        {f.options.map((o, i) => (
          <div className="optedit" key={i}>
            <input type="radio" name="corr" checked={f.correct === i} onChange={() => setF({ ...f, correct: i })} aria-label={'Correct option ' + optionLabel(i)} />
            <input type="text" placeholder={'Option ' + optionLabel(i)} value={o} onChange={e => setF({ ...f, options: f.options.map((x, k) => k === i ? e.target.value : x) })} />
            {f.options.length > 2 && <button className="danger" style={{ marginBottom: 10 }} onClick={() => removeOpt(i)} aria-label={'Remove option ' + optionLabel(i)}><Icon name="close" size={15} /></button>}
          </div>
        ))}
        <div className="row">
          {f.options.length < 4 && <button className="ghost" onClick={() => setF({ ...f, options: [...f.options, ''] })}><Icon name="plus" size={16} />Add option</button>}
        </div>
      </>) : (<>
        <label className="field" htmlFor="qb-marks">Maximum marks</label>
        <input id="qb-marks" type="text" inputMode="decimal" value={f.maxMarks} onChange={e => setF({ ...f, maxMarks: e.target.value })} style={{ maxWidth: 140 }} />
        <label className="field" htmlFor="qb-instructions">Instructions for the student (optional, shown on the exam)</label>
        <textarea id="qb-instructions" placeholder="e.g. Answer in 150-200 words." value={f.instructions} onChange={e => setF({ ...f, instructions: e.target.value })} style={{ minHeight: 50 }} />
        <label className="field" htmlFor="qb-rubric">Marking rubric (optional, private - never shown to students)</label>
        <textarea id="qb-rubric" placeholder={'e.g.\nCorrect explanation of a class: 3 marks.\nCorrect explanation of an object: 3 marks.\nRelevant example: 2 marks.\nClarity and technical accuracy: 2 marks.'} value={f.rubric} onChange={e => setF({ ...f, rubric: e.target.value })} style={{ minHeight: 90 }} />
        <label className="field" htmlFor="qb-concepts">Key concepts a good answer should include (optional, private, comma-separated)</label>
        <input id="qb-concepts" type="text" placeholder="e.g. class, object, instantiation" value={f.keyConcepts} onChange={e => setF({ ...f, keyConcepts: e.target.value })} />
        <label className="field" htmlFor="qb-model">Model answer (optional, private)</label>
        <textarea id="qb-model" placeholder="A strong example answer, for grading reference only." value={f.modelAnswer} onChange={e => setF({ ...f, modelAnswer: e.target.value })} style={{ minHeight: 70 }} />
      </>)}

      <div className="row">
        <button className="outline" onClick={add}>{editing === null ? 'Add question to paper' : 'Save question'}</button>
        {editing !== null && <button className="ghost" onClick={reset}>Cancel edit</button>}
      </div>
      <p className="err msg">{msg}</p>
    </div>
  </>);
}
