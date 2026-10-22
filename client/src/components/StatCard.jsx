import { Link } from 'react-router-dom';
import Icon from './Icon';
// A dashboard metric. `delta` is only ever a real count (e.g. created in the last 30 days), never an estimate.
export default function StatCard({ icon, tone = 'purple', title, value, delta, to }) {
  const body = (<>
    <div className={'ic ' + tone}><Icon name={icon} size={24} /></div>
    <div style={{ minWidth: 0 }}>
      <div className="t">{title}</div>
      <div className="v">{value}</div>
      {delta && <div className="d">{delta}</div>}
    </div>
  </>);
  return to ? <Link className="statcard" to={to}>{body}</Link> : <div className="statcard">{body}</div>;
}
