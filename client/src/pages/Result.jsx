import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import load from '../utils/load';
import optionLabel from '../utils/optionLabel';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';

// Everything shown here comes from the submit response the server returned (saved answers + key).
function Ring({ pct }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={'Score ' + pct + '%'}>
      <defs><linearGradient id="ringGrad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="var(--accent2)" /><stop offset="1" stopColor="var(--blue)" /></linearGradient></defs>
      <circle cx="60" cy="60" r={r} className="ring-bg" />
      <circle cx="60" cy="60" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      <text x="60" y="58" textAnchor="middle" className="ring-n">{pct}%</text>
      <text x="60" y="78" textAnchor="middle" className="ring-l">score</text>
    </svg>
  );
}

export default function Result() {
  const R = load('qr_result', null, sessionStorage);
  const [filter, setFilter] = useState('all');
  if (!R) return <Navigate to="/" replace />;
  const pct = R.total ? Math.round(R.ok / R.total * 100) : 0;
  const status = qi => R.answers[qi] < 0 ? 'unanswered' : R.answers[qi] === R.run[qi].correct ? 'correct' : 'wrong';
  const counts = { correct: R.ok, wrong: R.run.filter((_, qi) => status(qi) === 'wrong').length, unanswered: R.answers.filter(a => a < 0).length };
  const shown = R.run.map((q, qi) => [q, qi]).filter(([, qi]) => filter === 'all' || status(qi) === filter);
  const tabs = [['all', 'All', R.total], ['correct', 'Correct', counts.correct], ['wrong', 'Wrong', counts.wrong], ['unanswered', 'Unanswered', counts.unanswered]];

  return (<div className="fade-up">
    <div className="card result-hero">
      <Ring pct={pct} />
      <div className="result-copy">
        {R.preview && <span className="badge info"><Icon name="eye" />Admin preview</span>}
        <h1>{pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Well done!' : 'Test submitted'}</h1>
        <p className="muted">{R.name}, you scored <b style={{ color: 'var(--ink)' }}>{R.ok} out of {R.total}</b>. Here is how you did.</p>
        <div className="score">
          <div className="s-ok"><b>{counts.correct}</b>Correct</div>
          <div className="s-bad"><b>{counts.wrong}</b>Wrong</div>
          <div className="s-all"><b>{counts.unanswered}</b>Unanswered</div>
        </div>
        <div className="row">
          {R.preview
            ? <Link className="btn" to="/admin/papers">Back to papers</Link>
            : (<><Link className="btn" to="/dashboard"><Icon name="home" size={16} />My dashboard</Link><Link className="btn ghost" to="/">Home</Link></>)}
        </div>
      </div>
    </div>

    <div className="card-head" style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: 20 }}>Review your answers</h2>
      <div className="tabs" role="tablist" aria-label="Filter questions">
        {tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span>{n}</span></button>)}
      </div>
    </div>
    {!shown.length && <div className="card"><EmptyState icon="checkCircle">No questions in this group.</EmptyState></div>}
    {shown.map(([q, qi]) => {
      const st = status(qi);
      return (
        <div className={'card review ' + st} key={qi}>
          <div className="review-head">
            <span className="qlabel">Question {qi + 1}</span>
            <span className={'badge ' + (st === 'correct' ? 'ok' : st === 'wrong' ? 'bad' : 'warn')}>
              <Icon name={st === 'correct' ? 'check' : st === 'wrong' ? 'close' : 'minus'} />{st === 'correct' ? 'Correct' : st === 'wrong' ? 'Wrong' : 'Not answered'}
            </span>
          </div>
          <h2 className="qtext">{q.text}</h2>
          {q.options.map((o, i) => {
            let cls = 'opt', tag = '';
            if (i === q.correct) { cls += ' correct'; tag = R.answers[qi] === i ? 'Your answer · correct' : 'Correct answer'; }
            else if (R.answers[qi] === i) { cls += ' wrong'; tag = 'Your answer · wrong'; }
            return <div key={i} className={cls}><span className="k">{optionLabel(i)}</span><span>{o}</span>{tag && <span className="tag">{tag}</span>}</div>;
          })}
        </div>
      );
    })}
  </div>);
}
