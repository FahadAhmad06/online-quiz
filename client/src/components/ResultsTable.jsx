import usePaged from '../hooks/usePaged';
import Pagination from './Pagination';
import EmptyState from './EmptyState';
import Icon from './Icon';

// Evaluation badge for a result's subjective-grading progress (only present on rows from
// GET /admin/papers/:id, which joins it in only when the paper has subjective questions).
function SubjectiveBadge({ s }) {
  if (!s) return <span className="muted small-text">—</span>;
  if (s.subjectiveFailed) return <span className="badge bad"><Icon name="alert" />{s.subjectiveFailed} failed</span>;
  if (s.subjectiveManualReview) return <span className="badge bad"><Icon name="alert" />Manual review</span>;
  if (s.subjectiveApproved === s.subjectiveTotal) return <span className="badge ok"><Icon name="check" />All approved</span>;
  if (s.subjectivePending) return <span className="badge info"><Icon name="clock" />AI grading</span>;
  return <span className="badge warn"><Icon name="clock" />{s.subjectiveApproved}/{s.subjectiveTotal} approved</span>;
}

export default function ResultsTable({ rows, showPaper, onDelete, onAllowRetake, retakeAllowed, onCancelRetake, retakeCancelled, retakePending, pageSize = 20 }) {
  const pg = usePaged(rows, pageSize, rows.length);
  if (!rows.length) return <EmptyState icon="chart">No results yet.</EmptyState>;
  const showEval = rows.some(r => r.subjective);
  return (<>
    <div className="wrapx">
      <table>
        <thead><tr><th>Rank</th><th>Name</th><th>Roll no.</th><th>Email</th>{showPaper && <th>Paper</th>}<th>Marks</th><th>Wrong</th><th>Score</th>{showEval && <th>Subjective</th>}<th>Date</th>{onAllowRetake && <th>Retake</th>}{onDelete && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>
          {pg.rows.map(r => (
            <tr key={r._id}>
              <td>{r.rank}</td><td><b>{r.name}</b></td><td>{r.roll}</td><td>{r.email || <span className="muted">—</span>}</td>{showPaper && <td>{r.paperCode}</td>}
              <td><b>{r.correct}/{r.total}</b></td><td>{r.wrong}</td><td>{r.percent}%</td>{showEval && <td><SubjectiveBadge s={r.subjective} /></td>}<td>{new Date(r.createdAt).toLocaleString()}</td>
              {onAllowRetake && (
                <td>{retakeAllowed?.(r)
                  ? <div className="row" style={{ flexWrap: 'nowrap' }}><span className="badge ok"><Icon name="check" />Retake allowed</span>{onCancelRetake && <button className="ghost small" disabled={retakePending?.(r)} onClick={() => onCancelRetake(r)}>Cancel retake</button>}</div>
                  : <div className="row" style={{ flexWrap: 'nowrap' }}>{retakeCancelled?.(r) && <span className="badge bad"><Icon name="close" />Cancelled</span>}<button className="small" disabled={retakePending?.(r)} onClick={() => onAllowRetake(r)}>{retakePending?.(r) ? 'Saving…' : 'Allow retake'}</button></div>}</td>
              )}
              {onDelete && <td><button className="danger" onClick={() => onDelete(r)} aria-label={'Delete result of ' + r.name}><Icon name="trash" size={15} /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pagination {...pg} />
  </>);
}
