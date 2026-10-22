export default function StatusBadge({ paper }) {
  if (paper.status === 'scheduled') return <span className="badge warn">Scheduled</span>;
  if (paper.status === 'expired') return <span className="badge bad">Link expired</span>;
  return <span className="badge ok">Link active</span>;
}
