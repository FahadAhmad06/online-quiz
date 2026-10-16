import isOpen from '../utils/isOpen';
export default function StatusBadge({ paper }) {
  const open = isOpen(paper);
  return <span className={'badge ' + (open ? 'ok' : 'bad')}>{open ? 'Link active' : 'Link expired'}</span>;
}
