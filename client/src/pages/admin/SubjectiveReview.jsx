import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import usePoll, { POLL_FAST, POLL_SLOW } from '../../hooks/usePoll';
import LiveStatus from '../../components/LiveStatus';
import PageHeader from '../../components/PageHeader';
import Async from '../../components/Async';
import Icon from '../../components/Icon';
import { useConfirm, useToast } from '../../components/Feedback';
import api from '../../utils/api';
import mdToHtml from '../../utils/mdToHtml';

const STATUS = {
  pending: { label: 'Pending', tone: 'info' }, evaluating: { label: 'AI evaluating', tone: 'info' },
  awaiting_review: { label: 'Evaluated · awaiting approval', tone: 'warn' }, approved: { label: 'Approved', tone: 'ok' },
  manual_review: { label: 'Manual review', tone: 'bad' }, failed: { label: 'Evaluation failed', tone: 'bad' }
};
const aiBusy = st => st === 'pending' || st === 'evaluating';
const secs = ms => (ms / 1000).toFixed(1) + 's';

function QuestionReview({ attemptId, item, onChanged }) {
  const e = item.evaluation;
  const [marks, setMarks] = useState(e.finalMarks ?? e.suggestedMarks ?? '');
  const [feedback, setFeedback] = useState(e.finalFeedback || e.feedback || '');
  // Live updates refill the form from the newest evaluation unless the admin has started editing it.
  const [dirty, setDirty] = useState(false);
  const version = [e.status, e.suggestedMarks, e.finalMarks, e.feedback, e.finalFeedback, e.completedAt].join('|');
  useEffect(() => {
    if (dirty) return;
    setMarks(e.finalMarks ?? e.suggestedMarks ?? '');
    setFeedback(e.finalFeedback || e.feedback || '');
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(''); // which action is in flight
  const [err, setErr] = useState('');
  const confirm = useConfirm(), toast = useToast();
  const base = '/admin/subjective/submissions/' + attemptId + '/' + item.idx;
  const approved = e.status === 'approved';
  const st = STATUS[e.status] || { label: e.status, tone: '' };

  const run = async (action, body, okMsg) => {
    setBusy(action); setErr('');
    try { await api(base + '/' + action, { method: 'POST', body }); toast.ok(okMsg); setDirty(false); onChanged(); }
    catch (err2) { setErr(err2.message); }
    setBusy('');
  };
  const approve = () => {
    const m = Number(marks);
    if (!Number.isFinite(m) || m < 0 || m > item.maxMarks) return setErr('Marks must be between 0 and ' + item.maxMarks + '.');
    run('approve', { marks: m, feedback }, 'Marks approved for question ' + (item.idx + 1) + '.');
  };
  const flagManual = async () => {
    if (!(await confirm({ title: 'Flag for manual review?', message: 'This marks the question as needing closer attention instead of approving it now.', confirmText: 'Flag it' }))) return;
    run('manual-review', { reason }, 'Flagged for manual review.');
  };
  const reEvaluate = async () => {
    if (e.status !== 'failed' && !(await confirm({ title: 'Request a fresh AI evaluation?', message: approved ? 'This question is already approved. Re-evaluating replaces the current suggestion and un-approves it until you review it again.' : 'This discards the current AI suggestion and asks the AI again.', confirmText: 'Re-evaluate', danger: approved }))) return;
    run('re-evaluate', {}, e.status === 'failed' ? 'Retrying AI evaluation.' : 'Re-evaluation requested.');
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Question {item.idx + 1} · {item.maxMarks} marks</h2>
        <span className={'badge ' + st.tone}>{st.label}</span>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          <p className="muted small-text" style={{ margin: '0 0 4px' }}>Question</p>
          <p style={{ marginTop: 0 }}>{item.question}</p>
          {item.instructions && <p className="muted small-text">Instructions shown to student: {item.instructions}</p>}
          {item.rubric && (<>
            <p className="muted small-text" style={{ margin: '10px 0 4px' }}>Marking rubric (private)</p>
            <div className="answer-view card" style={{ background: 'var(--bg2)', boxShadow: 'none', whiteSpace: 'pre-wrap' }}>{item.rubric}</div>
          </>)}
          {item.keyConcepts?.length > 0 && <p className="muted small-text" style={{ marginTop: 8 }}>Key concepts: {item.keyConcepts.join(', ')}</p>}
          {item.modelAnswer && (<>
            <p className="muted small-text" style={{ margin: '10px 0 4px' }}>Model answer (private)</p>
            <div className="answer-view card" style={{ background: 'var(--bg2)', boxShadow: 'none', whiteSpace: 'pre-wrap' }}>{item.modelAnswer}</div>
          </>)}
        </div>
        <div>
          <p className="muted small-text" style={{ margin: '0 0 4px' }}>Student's answer</p>
          <div className="answer-view card" style={{ background: 'var(--bg2)', boxShadow: 'none' }}>
            {item.answer ? <div dangerouslySetInnerHTML={{ __html: mdToHtml(item.answer) }} /> : <p className="muted">No answer submitted.</p>}
          </div>
        </div>
      </div>

      {e.status === 'pending' && <p className="notice"><Icon name="clock" size={16} />Pending — waiting for an AI grading slot.</p>}
      {e.status === 'evaluating' && <p className="notice"><span className="spinner" />AI is evaluating this answer{e.claimedAt ? ' (started ' + new Date(e.claimedAt).toLocaleTimeString() + ')' : ''}…</p>}
      {!aiBusy(e.status) && (
        <div className="card elevated" style={{ margin: '16px 0 0' }}>
          <h3 style={{ marginTop: 0 }}>AI evaluation</h3>
          {e.status === 'failed' && <p className="err">AI evaluation failed: {e.failReason || 'Unknown error.'}{e.failKind === 'permanent' ? ' This will not be retried automatically.' : ''}</p>}
          {e.status === 'manual_review' && e.suggestedMarks === null && <p className="notice warn"><Icon name="alert" size={16} />Flagged for manual review{e.failReason ? ': ' + e.failReason : ' — no AI suggestion was produced.'}</p>}
          {e.needsManualReview && e.suggestedMarks !== null && <p className="notice warn"><Icon name="alert" size={16} />The AI flagged this for manual review: {e.reasoningSummary}</p>}
          {e.suggestedMarks !== null && (<>
            <p>AI suggested <b>{e.suggestedMarks}/{item.maxMarks}</b> marks.</p>
            {e.reasoningSummary && !e.needsManualReview && <p className="muted small-text">{e.reasoningSummary}</p>}
            {e.strengths?.length > 0 && <p className="small-text"><b>Strengths:</b> {e.strengths.join('; ')}</p>}
            {e.missingConcepts?.length > 0 && <p className="small-text"><b>Missing:</b> {e.missingConcepts.join('; ')}</p>}
            {e.mistakes?.length > 0 && <p className="small-text"><b>Mistakes:</b> {e.mistakes.join('; ')}</p>}
          </>)}
          {e.durationMs !== null && e.durationMs !== undefined && (
            <p className="muted small-text" style={{ marginBottom: 0 }}>
              Grading took {secs(e.durationMs)} ({e.aiCalls} {e.provider || 'AI'} call{e.aiCalls === 1 ? '' : 's'}{e.aiCalls > 1 ? ', incl. retries' : ''}{e.usage?.total ? ', ' + e.usage.total + ' tokens' : ''}){e.model ? ' · ' + e.model : ''}{e.fallbackUsed ? ' · fell back from the primary provider' : ''}{e.retryCount ? ' · ' + e.retryCount + ' failed run' + (e.retryCount === 1 ? '' : 's') : ''}.
            </p>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
        <div>
          <label className="field" htmlFor={'marks-' + item.idx}>Final marks (0–{item.maxMarks})</label>
          <input id={'marks-' + item.idx} type="number" min="0" max={item.maxMarks} value={marks} onChange={ev => { setMarks(ev.target.value); setDirty(true); }} style={{ width: 120 }} disabled={aiBusy(e.status)} />
        </div>
      </div>
      <label className="field" htmlFor={'fb-' + item.idx}>Feedback shown to the student after approval</label>
      <textarea id={'fb-' + item.idx} value={feedback} onChange={ev => { setFeedback(ev.target.value); setDirty(true); }} disabled={aiBusy(e.status)} style={{ minHeight: 70 }} />

      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={approve} disabled={!!busy || approved || aiBusy(e.status)}>
          {busy === 'approve' ? <><span className="spinner" />Approving…</> : approved ? <><Icon name="checkCircle" size={16} />Approved</> : 'Approve marks'}
        </button>
        <button className="ghost" onClick={reEvaluate} disabled={!!busy}>{busy === 're-evaluate' ? <><span className="spinner" />Requesting…</> : e.status === 'failed' ? 'Retry AI evaluation' : 'Request re-evaluation'}</button>
        {!approved && e.status !== 'manual_review' && <button className="ghost" onClick={flagManual} disabled={!!busy}>Flag manual review</button>}
      </div>
      {!approved && e.status !== 'manual_review' && (
        <input type="text" placeholder="Reason for manual review (optional)" value={reason} onChange={ev => setReason(ev.target.value)} style={{ marginTop: 8, maxWidth: 420 }} />
      )}
      {err && <p className="err msg" role="alert">{err}</p>}
    </div>
  );
}

export default function SubjectiveReview() {
  const { attemptId } = useParams();
  // Fast while any answer is with the AI; slower afterwards so another admin's decision still appears.
  const state = usePoll('/admin/subjective/submissions/' + attemptId,
    d => d.questions.some(q => aiBusy(q.evaluation.status)) ? POLL_FAST : POLL_SLOW);
  return (
    <Async state={state}>{d => (<>
      <PageHeader title={'Review: ' + d.name} subtitle={d.paperTitle + ' · Roll ' + d.roll + ' · submitted ' + new Date(d.submittedAt).toLocaleString()}>
        <LiveStatus live={state.live} onResume={state.reload} />
        <Link className="btn ghost" to="/admin/subjective">Back to list</Link>
      </PageHeader>
      {d.questions.map(item => <QuestionReview key={item.idx} attemptId={attemptId} item={item} onChanged={state.reload} />)}
    </>)}</Async>
  );
}
