import clock from '../utils/clock';
import Icon from './Icon';
// Displays the server-set deadline for the whole test. `remaining` is in seconds.
export default function ExamTimer({ remaining }) {
  const tone = remaining <= 10 ? ' low' : remaining <= 60 ? ' warn' : '';
  return (
    <div className="timers" role="timer" aria-label={'Time left: ' + clock(remaining)}>
      <div className={'timer' + tone}><Icon name="clock" size={22} />{clock(remaining)}</div>
      <div className="muted small-text">left for the whole test</div>
    </div>
  );
}
