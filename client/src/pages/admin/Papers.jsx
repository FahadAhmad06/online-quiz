import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import StatusBadge from '../../components/StatusBadge';
import remaining from '../../utils/remaining';
export default function Papers() {
  const state = useFetch('/admin/papers');
  return (<>
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0 }}>Papers</h2><Link className="btn" to="/admin/papers/new">New paper</Link>
    </div>
    <Async state={state}>{papers => (
      <div className="card">
        {!papers.length && <p className="muted">No papers yet. Create your first one.</p>}
        {papers.map(p => (
          <div className="qrow" key={p._id}>
            <div>
              <b>{p.title}</b> <StatusBadge paper={p} />
              <div className="muted">Code {p.code} · {p.questionCount} questions · {remaining(p)} · {p.submissions} submitted</div>
            </div>
            <Link className="btn ghost small" to={'/admin/papers/' + p._id}>Open</Link>
          </div>
        ))}
      </div>
    )}</Async>
  </>);
}
