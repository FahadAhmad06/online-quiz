import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import ResultsTable from '../../components/ResultsTable';
export default function Dashboard() {
  const state = useFetch('/admin/stats');
  return (
    <Async state={state}>{d => (<>
      <div className="score">
        <div className="s-all"><b>{d.papers}</b>Papers</div>
        <div className="s-ok"><b>{d.active}</b>Active links</div>
        <div className="s-all"><b>{d.submissions}</b>Submissions</div>
      </div>
      <div className="card"><h2>Latest results</h2><ResultsTable rows={d.latest} showPaper /></div>
    </>)}</Async>
  );
}
