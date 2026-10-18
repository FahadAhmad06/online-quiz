export default function ResultsTable({ rows, showPaper, onDelete, onAllowRetake, retakeAllowed, onCancelRetake, retakeCancelled }) {
  if (!rows.length) return <p className="muted">No results yet.</p>;
  return (
    <div className="wrapx">
      <table>
        <thead><tr><th>Rank</th><th>Name</th><th>Roll no.</th><th>Email</th>{showPaper && <th>Paper</th>}<th>Marks</th><th>Wrong</th><th>Score</th><th>Date</th>{onAllowRetake && <th>Retake</th>}{onDelete && <th></th>}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r._id}>
              <td>{r.rank}</td><td>{r.name}</td><td>{r.roll}</td><td>{r.email}</td>{showPaper && <td>{r.paperCode}</td>}
              <td><b>{r.correct}/{r.total}</b></td><td>{r.wrong}</td><td>{r.percent}%</td><td>{new Date(r.createdAt).toLocaleString()}</td>
              {onAllowRetake && (
                <td>{retakeAllowed?.(r)
                  ? <div className="row"><span className="badge ok">Retake allowed</span>{onCancelRetake && <button className="ghost small" onClick={() => onCancelRetake(r)}>Cancel retake</button>}</div>
                  : <div className="row">{retakeCancelled?.(r) && <span className="badge bad">Cancelled</span>}<button className="small" onClick={() => onAllowRetake(r)}>Allow retake</button></div>}</td>
              )}
              {onDelete && <td><button className="danger" onClick={() => onDelete(r)}>Delete</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
