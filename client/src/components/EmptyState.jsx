import Icon from './Icon';
export default function EmptyState({ icon = 'file', children }) {
  return <div className="empty"><div className="icon"><Icon name={icon} size={34} strokeWidth={1.6} /></div>{children}</div>;
}
