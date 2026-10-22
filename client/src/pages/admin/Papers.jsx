import { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import usePaged from '../../hooks/usePaged';
import Async from '../../components/Async';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import Pagination from '../../components/Pagination';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import remaining from '../../utils/remaining';
import duration from '../../utils/duration';

function PaperTable({ papers }) {
  const [q, setQ] = useState(''), [status, setStatus] = useState('');
  const s = q.trim().toLowerCase();
  const rows = papers.filter(p => (!status || p.status === status) && (!s || (p.title + ' ' + p.code).toLowerCase().includes(s)));
  const pg = usePaged(rows, 15, s + status);
  return (<>
    <div className="toolbar">
      <div className="search-input"><Icon name="search" size={16} /><input type="search" placeholder="Search by title or code" value={q} onChange={e => setQ(e.target.value)} aria-label="Search quizzes" /></div>
      <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
        <option value="">All statuses</option><option value="active">Live</option><option value="scheduled">Upcoming</option><option value="expired">Link expired</option>
      </select>
    </div>
    {!rows.length ? <EmptyState icon="quiz">{papers.length ? 'No quizzes match your filters.' : <>No quizzes yet. <Link className="link" to="/admin/papers/new">Create your first one</Link>.</>}</EmptyState> : (<>
      <div className="wrapx"><table>
        <thead><tr><th>Quiz</th><th>Questions</th><th>Duration</th><th>Starts</th><th>Status</th><th>Link</th><th>Submitted</th><th>Actions</th></tr></thead>
        <tbody>{pg.rows.map(p => (
          <tr key={p._id}>
            <td className="wrap"><Link to={'/admin/papers/' + p._id} style={{ textDecoration: 'none' }}><b>{p.title}</b></Link><div className="muted small-text">Code {p.code}</div></td>
            <td>{p.questionCount}</td>
            <td>{duration(p)}</td>
            <td>{p.startsAt ? new Date(p.startsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : <span className="muted">Immediately</span>}</td>
            <td><StatusBadge paper={p} /></td>
            <td className="muted small-text">{remaining(p)}</td>
            <td>{p.submissions}</td>
            <td><div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <Link className="btn outline small" to={'/admin/papers/' + p._id}>Manage</Link>
              {p.submissions === 0 && <Link className="btn ghost small" to={'/admin/papers/' + p._id + '/edit'} aria-label={'Edit ' + p.title}><Icon name="edit" size={15} />Edit</Link>}
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Pagination {...pg} />
    </>)}
  </>);
}

export default function Papers() {
  const state = useFetch('/admin/papers');
  return (<>
    <PageHeader title="Manage Quizzes" subtitle="Create papers, share their links, and manage timing and results.">
      <Link className="btn" to="/admin/papers/new"><Icon name="plus" size={16} />Create quiz</Link>
    </PageHeader>
    <div className="card"><Async state={state}>{papers => <PaperTable papers={papers} />}</Async></div>
  </>);
}
