import Icon from './Icon';
import StatCard from './StatCard';
import subjectiveStats from '../utils/subjectiveStats';

// Mirrors the admin grading dashboard's icon/tone language (clock=awaiting, checkCircle=approved,
// alert/x=needs attention) so the same status reads the same way for students and admins.
export default function SubjectiveStats({ subjective }) {
  if (!subjective?.length) return null;
  const c = subjectiveStats(subjective);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="card-head"><h2 style={{ fontSize: 20 }}><span className="hicon"><Icon name="edit" size={16} /></span>Subjective questions</h2></div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <StatCard icon="file" tone="purple" title="Total subjective" value={c.total} />
        <StatCard icon="checkCircle" tone="blue" title="Answered" value={c.answered} />
        <StatCard icon="minus" tone="amber" title="Unanswered" value={c.unanswered} />
      </div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard icon="checkCircle" tone="green" title="Correct" value={c.correct} />
        <StatCard icon="edit" tone="purple" title="Partially correct" value={c.partial} />
        <StatCard icon="x" tone="red" title="Wrong" value={c.wrong} />
        <StatCard icon="clock" tone="blue" title="Pending evaluation" value={c.pending} />
      </div>
    </div>
  );
}
