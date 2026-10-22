import Icon from './Icon';
// Paper status from the server's paperSummary(): 'scheduled' | 'expired' | 'active'. Icon + text, never colour alone.
export default function StatusBadge({ paper }) {
  if (paper.status === 'scheduled') return <span className="badge info"><Icon name="clock" />Upcoming</span>;
  if (paper.status === 'expired') return <span className="badge bad"><Icon name="lock" />Link expired</span>;
  return <span className="badge ok"><Icon name="checkCircle" />Live</span>;
}
