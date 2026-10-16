import { Link, Navigate } from 'react-router-dom';
import load from '../utils/load';
import optionLabel from '../utils/optionLabel';
export default function Result() {
  const R = load('qr_result', null, sessionStorage);
  if (!R) return <Navigate to="/" replace />;
  const pct = R.total ? Math.round(R.ok / R.total * 100) : 0;
  return (<>
    <div className="card">
      <h1>Your result: {pct}%</h1>
      <p className="muted">{R.name}, here is how you did.</p>
      <div className="score">
        <div className="s-ok"><b>{R.ok}</b>Correct</div><div className="s-bad"><b>{R.total - R.ok}</b>Wrong</div><div className="s-all"><b>{R.total}</b>Total</div>
      </div>
      <Link className="btn" to={R.preview ? '/admin/papers' : '/'}>{R.preview ? 'Back to papers' : 'Home'}</Link>
    </div>
    <h2>Review your answers</h2>
    {R.run.map((q, qi) => (
      <div className="card" key={qi}>
        <div className="muted">Question {qi + 1}{R.answers[qi] < 0 ? ' · not answered' : ''}</div><h2>{q.text}</h2>
        {q.options.map((o, i) => {
          let cls = 'opt', tag = '';
          if (i === q.correct) { cls += ' correct'; tag = R.answers[qi] === i ? 'Your answer · correct' : 'Correct answer'; }
          else if (R.answers[qi] === i) { cls += ' wrong'; tag = 'Your answer · wrong'; }
          return <div key={i} className={cls}><span className="k">{optionLabel(i)}</span><span>{o}</span>{tag && <span className="tag">{tag}</span>}</div>;
        })}
      </div>
    ))}
  </>);
}
