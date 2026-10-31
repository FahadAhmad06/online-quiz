import Icon from './Icon';
// Read-only map of the test. Navigation is strictly forward via Next for MCQ (enforced by the
// server); subjective questions already reached stay revisable via Previous/Next until submit,
// so they're shown as "answered" without a lock icon, not "locked". `view` is whichever question
// is currently displayed - it can trail behind `idx` (the frontier) while revising an earlier
// subjective answer, so it gets its own highlight distinct from "current".
export default function QuestionNavigator({ count, idx, view, answers, run, subjectiveText }) {
  const v = view ?? idx;
  const isSubjective = i => run?.[i]?.type === 'subjective';
  const isAnswered = i => isSubjective(i) ? !!subjectiveText?.[i]?.trim() : answers[i] >= 0;
  const state = i => i < idx ? (isAnswered(i) ? 'answered' : 'skipped') : i === idx ? 'current' : 'upcoming';
  const label = i => {
    const s = state(i);
    if (s === 'answered') return isSubjective(i) ? 'answered, revisable' : 'answered, locked';
    if (s === 'skipped') return isSubjective(i) ? 'not yet answered, revisable' : 'skipped, locked';
    return { current: 'current question', upcoming: 'not reached yet' }[s];
  };
  return (<>
    <ol className="qpalette" aria-label="Question progress">
      {Array.from({ length: count }, (_, i) => {
        const s = state(i);
        const locked = (s === 'answered' || s === 'skipped') && !isSubjective(i);
        return (
          <li key={i} className={'qpill ' + s + (i === v && i !== idx ? ' viewing' : '')} aria-current={i === v ? 'step' : undefined}
            aria-label={'Question ' + (i + 1) + ', ' + label(i)} title={'Question ' + (i + 1) + ': ' + label(i)}>
            {locked && <Icon name="lock" strokeWidth={2.5} />}{i + 1}
          </li>
        );
      })}
    </ol>
    <div className="qlegend" aria-hidden="true">
      <span><i className="current" />Current</span>
      <span><i className="answered"><Icon name="lock" strokeWidth={3} /></i>Answered · locked</span>
      <span><i className="answered" />Answered · revisable</span>
    </div>
  </>);
}
