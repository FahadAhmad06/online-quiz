import Icon from './Icon';
// Read-only map of the test. Navigation is strictly forward via Next (enforced by the server), so the
// pills are deliberately not buttons: earlier questions are locked, later ones aren't reachable yet.
// Each state has an icon/border style and an accessible label, not just a colour.
export default function QuestionNavigator({ count, idx, answers }) {
  const state = i => i < idx ? (answers[i] >= 0 ? 'answered' : 'skipped') : i === idx ? 'current' : 'upcoming';
  const label = { answered: 'answered, locked', skipped: 'skipped, locked', current: 'current question', upcoming: 'not reached yet' };
  return (<>
    <ol className="qpalette" aria-label="Question progress">
      {Array.from({ length: count }, (_, i) => {
        const s = state(i);
        return (
          <li key={i} className={'qpill ' + s} aria-current={s === 'current' ? 'step' : undefined}
            aria-label={'Question ' + (i + 1) + ', ' + label[s]} title={'Question ' + (i + 1) + ': ' + label[s]}>
            {(s === 'answered' || s === 'skipped') && <Icon name="lock" strokeWidth={2.5} />}{i + 1}
          </li>
        );
      })}
    </ol>
    <div className="qlegend" aria-hidden="true">
      <span><i className="current" />Current</span>
      <span><i className="answered"><Icon name="lock" strokeWidth={3} /></i>Answered · locked</span>
    </div>
  </>);
}
