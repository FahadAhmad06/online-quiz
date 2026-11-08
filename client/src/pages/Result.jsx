import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import load from '../utils/load';
import api from '../utils/api';
import optionLabel from '../utils/optionLabel';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import mdToHtml from '../utils/mdToHtml';
import usePoll, { POLL_FAST, POLL_SLOW } from '../hooks/usePoll';
import LiveStatus from '../components/LiveStatus';
import SubjectiveStats from '../components/SubjectiveStats';

// Student-facing labels for the server's per-answer status. Marks stay hidden until approved.
const STATUS = {
  pending: { label: 'Pending', tone: 'info', icon: 'clock', hint: 'Queued for AI grading.' },
  evaluating: { label: 'AI Evaluating', tone: 'info', spin: true, hint: 'The AI is grading this answer now.' },
  awaiting_review: { label: 'Awaiting Admin Approval', tone: 'warn', icon: 'clock', hint: 'AI grading is done. Marks appear here once your teacher approves them.' },
  manual_review: { label: 'Awaiting Admin Approval', tone: 'warn', icon: 'clock', hint: 'Your teacher will review this answer personally.' },
  approved: { label: 'Evaluated', tone: 'ok', icon: 'checkCircle' },
  failed: { label: 'Evaluation Failed', tone: 'bad', icon: 'alert' }
};
// Fast while the AI is working, slow while only an admin decision is outstanding, stop when final.
const nextPoll = d => !d.pending ? null : (d.progress?.pending || d.progress?.evaluating) ? POLL_FAST : POLL_SLOW;

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

// Shown while any subjective question on the attempt hasn't been admin-approved yet. No score and
// no AI marks or feedback - only each answer's live status, plus final marks for answers an admin
// has already approved. Updates by itself as the server's state changes.
function PendingResult({ R, live, onRefresh }) {
  const [busy, setBusy] = useState(null), [retryErr, setRetryErr] = useState({});
  const p = R.progress;
  const retry = async idx => {
    setBusy(idx); setRetryErr(e => ({ ...e, [idx]: '' }));
    try { await api('/attempts/' + R.attemptId + '/subjective/' + idx + '/retry', { method: 'POST' }); }
    catch (e) { setRetryErr(x => ({ ...x, [idx]: e.message })); }
    setBusy(null);
    onRefresh(); // resumes fast polling - the answer is pending again
  };
  return (<div className="fade-up">
    <div className="card result-hero">
      <div className="result-copy">
        <span className="badge warn"><Icon name="clock" size={14} />Awaiting final review</span>
        <h1>Your answers have been submitted</h1>
        <p className="muted">{R.name ? R.name + ', y' : 'Y'}our subjective answers are graded by AI and then approved by your teacher. You'll see final marks and feedback once they're approved.</p>
        {R.mcqTotal > 0 && <p className="muted small-text">Objective questions so far (MCQ + True/False): <b style={{ color: 'var(--ink)' }}>{R.mcqCorrect}/{R.mcqTotal}</b> correct (final total includes subjective marks once approved).</p>}
        {p && (
          <div className="eval-progress">
            <div className="small-text"><b>{p.evaluated} of {p.total}</b> answer{p.total === 1 ? '' : 's'} evaluated{p.approved ? ' · ' + p.approved + ' approved' : ''}{p.failed ? ' · ' + p.failed + ' failed' : ''}</div>
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.evaluated} aria-label="Answers evaluated"><i style={{ width: (p.total ? p.evaluated / p.total * 100 : 0) + '%' }} /></div>
          </div>
        )}
        <LiveStatus live={live} onResume={onRefresh} />
        <div className="row">
          <Link className="btn" to="/dashboard"><Icon name="home" size={16} />My dashboard</Link>
          <Link className="btn ghost" to="/">Home</Link>
        </div>
      </div>
    </div>
    <SubjectiveStats subjective={R.subjective || []} />
    {(R.subjective || []).map(s => {
      const st = STATUS[s.status] || { label: s.status, tone: 'info' };
      return (
        <div className="card review" key={s.idx}>
          <div className="review-head">
            <span className="qlabel">Question {s.idx + 1} · {s.maxMarks} marks</span>
            <span className={'badge ' + st.tone}>
              {st.spin ? <span className="spinner" style={{ width: 12, height: 12 }} /> : st.icon && <Icon name={st.icon} />}
              {s.status === 'approved' ? st.label + ' · ' + s.marks + '/' + s.maxMarks + ' marks' : st.label}
            </span>
          </div>
          <h2 className="qtext">{s.text}</h2>
          {st.hint && <p className="muted small-text" style={{ margin: '0 0 8px' }}>{st.hint}</p>}
          {s.status === 'failed' && (
            <div className="notice warn" role="alert">
              <Icon name="alert" size={16} />
              <div>
                <span>{s.error}</span>
                {s.retryable && <div style={{ marginTop: 8 }}><button className="small" onClick={() => retry(s.idx)} disabled={busy !== null}>{busy === s.idx ? <><span className="spinner" />Retrying…</> : 'Retry AI grading'}</button></div>}
                {retryErr[s.idx] && <p className="err small-text" style={{ margin: '6px 0 0' }}>{retryErr[s.idx]}</p>}
              </div>
            </div>
          )}
          <div className="answer-view card" style={{ background: 'var(--bg2)', boxShadow: 'none' }}>
            {s.answer ? <div dangerouslySetInnerHTML={{ __html: mdToHtml(s.answer) }} /> : <p className="muted">No answer submitted.</p>}
          </div>
          {s.status === 'approved' && s.feedback && <div className="notice"><Icon name="info" size={16} /><span>{s.feedback}</span></div>}
        </div>
      );
    })}
  </div>);
}

export default function Result() {
  const [sp] = useSearchParams();
  const stored = load('qr_result', null, sessionStorage);
  const attemptParam = sp.get('attempt');
  const needsFetch = !!attemptParam || stored?.pending;
  const id = needsFetch ? attemptParam || stored?.attemptId : null;
  const [filter, setFilter] = useState('all');
  // Live: keeps polling the read-only result endpoint until every answer is approved.
  const poll = usePoll(id ? '/attempts/' + id + '/result' : null, nextPoll);
  const R = !needsFetch ? stored : poll.data && { ...poll.data, name: poll.data.name || stored?.name };
  const loadErr = needsFetch && !id ? 'Result not found.' : poll.error;

  if (!needsFetch && !stored) return <Navigate to="/" replace />;
  if (loadErr) return <div className="card"><h1>{loadErr}</h1><p className="muted">It may have expired or you may not have access to it.</p><Link className="btn ghost" to="/dashboard">Back to dashboard</Link></div>;
  if (!R) return <Loading />;
  if (R.pending) return <PendingResult R={R} live={poll.live} onRefresh={poll.reload} />;

  const score = R.ok ?? R.correct, total = R.total;
  const pct = total ? Math.round(score / total * 100) : 0;
  const subjByIdx = Object.fromEntries((R.subjective || []).map(s => [s.idx, s]));
  const status = qi => {
    if (R.run[qi].type === 'subjective') return 'subjective';
    return R.answers[qi] < 0 ? 'unanswered' : R.answers[qi] === R.run[qi].correct ? 'correct' : 'wrong';
  };
  const counts = {
    correct: R.run.filter((_, qi) => status(qi) === 'correct').length,
    wrong: R.run.filter((_, qi) => status(qi) === 'wrong').length,
    unanswered: R.run.filter((_, qi) => status(qi) === 'unanswered').length,
    subjective: R.run.filter((_, qi) => status(qi) === 'subjective').length
  };
  const shown = R.run.map((q, qi) => [q, qi]).filter(([, qi]) => filter === 'all' || status(qi) === filter);
  const tabs = [['all', 'All', R.run.length], ['correct', 'Correct', counts.correct], ['wrong', 'Wrong', counts.wrong],
    ['unanswered', 'Unanswered', counts.unanswered], ...(counts.subjective ? [['subjective', 'Subjective', counts.subjective]] : [])];

  return (<div className="fade-up">
    <div className="card result-hero">
      <Ring pct={pct} />
      <div className="result-copy">
        {R.preview && <span className="badge info"><Icon name="eye" />Admin preview</span>}
        <h1>{pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Well done!' : 'Test submitted'}</h1>
        <p className="muted">{R.name}, you scored <b style={{ color: 'var(--ink)' }}>{score} out of {total}</b>. Here is how you did.</p>
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

    <SubjectiveStats subjective={R.subjective || []} />

    <div className="card-head" style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: 20 }}>Review your answers</h2>
      <div className="tabs" role="tablist" aria-label="Filter questions">
        {tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span>{n}</span></button>)}
      </div>
    </div>
    {!shown.length && <div className="card"><EmptyState icon="checkCircle">No questions in this group.</EmptyState></div>}
    {shown.map(([q, qi]) => {
      const st = status(qi);
      if (st === 'subjective') {
        const s = subjByIdx[qi];
        return (
          <div className="card review" key={qi}>
            <div className="review-head">
              <span className="qlabel">Question {qi + 1} · {s?.maxMarks} marks</span>
              <span className="badge info"><Icon name="checkCircle" />{s?.marks}/{s?.maxMarks} marks</span>
            </div>
            <h2 className="qtext">{s?.text}</h2>
            <p className="muted small-text" style={{ margin: '0 0 6px' }}>Your answer</p>
            <div className="answer-view card" style={{ background: 'var(--bg2)', boxShadow: 'none', marginBottom: 12 }}>
              {s?.answer ? <div dangerouslySetInnerHTML={{ __html: mdToHtml(s.answer) }} /> : <p className="muted">No answer submitted.</p>}
            </div>
            {s?.feedback && (<>
              <p className="muted small-text" style={{ margin: '0 0 6px' }}>Feedback</p>
              <div className="notice"><Icon name="info" size={16} /><span>{s.feedback}</span></div>
            </>)}
          </div>
        );
      }
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
