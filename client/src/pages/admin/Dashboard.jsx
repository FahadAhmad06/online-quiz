import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import load from '../../utils/load';
import timeAgo from '../../utils/timeAgo';
import duration from '../../utils/duration';
import Icon from '../../components/Icon';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import ErrorBox from '../../components/ErrorBox';
import EmptyState from '../../components/EmptyState';
import { AreaChart, BarChart } from '../../components/Charts';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const activityIcon = { student: ['user', 'purple'], result: ['checkCircle', 'green'], paper: ['quiz', 'blue'], retake: ['retake', 'amber'] };
const quick = [
  { to: '/admin/papers/new', icon: 'plus', title: 'Create Quiz', sub: 'Add a new paper' },
  { to: '/admin/students', icon: 'user', title: 'Manage Students', sub: 'View records & history' },
  { to: '/admin/rolls', icon: 'key', title: 'Rolls & PINs', sub: 'Authorize & generate' },
  { to: '/admin/results', icon: 'chart', title: 'View Reports', sub: 'Check performance' },
  { to: '/admin/schedule', icon: 'calendar', title: 'Schedule Paper', sub: 'Set start date & time' },
  { to: '/admin/retakes', icon: 'retake', title: 'Retake Requests', sub: 'Allow or cancel' }
];
const recent = n => n ? <><Icon name="arrowUp" size={13} /><b>{n}</b>&nbsp;in the last 30 days</> : 'None in the last 30 days';

function Skeleton({ h = 120 }) { return <div className="skeleton" style={{ height: h, borderRadius: 16 }} />; }

export default function Dashboard() {
  const s = load('qr_admin', null, sessionStorage);
  const state = useFetch('/admin/stats?tz=' + encodeURIComponent(tz)), d = state.data;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i); }, []);
  const name = (s?.email || 'Admin').split('@')[0];

  return (<>
    <div className="page-head">
      <div>
        <h1>Welcome back, {name} 👋</h1>
        <p className="muted">Here's what's happening with your quiz platform today.</p>
      </div>
      <div className="datechip">
        <Icon name="calendar" size={20} />
        <div><b style={{ fontWeight: 600 }}>{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b>
          <div className="muted small-text">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div></div>
      </div>
    </div>

    {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}

    <div className="grid cols-4">
      {!d ? [0, 1, 2, 3].map(i => <Skeleton key={i} />) : (<>
        <StatCard icon="students" tone="purple" title="Total Students" value={d.students} delta={recent(d.studentsRecent)} to="/admin/students" />
        <StatCard icon="quiz" tone="blue" title="Total Quizzes" value={d.papers} delta={<>{d.active} with an open link</>} to="/admin/papers" />
        <StatCard icon="checkCircle" tone="green" title="Completed Attempts" value={d.submissions} delta={recent(d.submissionsRecent)} to="/admin/results" />
        <StatCard icon="clock" tone="amber" title="Pending Retakes" value={d.pendingRetakes} delta="Allowed, not started yet" to="/admin/retakes" />
      </>)}
    </div>

    <div className="dash-grid">
      <div className="card">
        <div className="card-head">
          <h2><span className="hicon"><Icon name="chart" size={16} /></span>Completed attempts · last 14 days</h2>
          <Link className="link" to="/admin/results">Reports</Link>
        </div>
        {!d ? <Skeleton h={220} /> : d.submissions === 0
          ? <EmptyState icon="chart">No attempts submitted yet. Data appears here as students finish papers.</EmptyState>
          : <AreaChart caption="Completed attempts per day" valueName="Attempts"
              data={d.days.map(x => {
                const dt = new Date(x.day + 'T12:00:00');
                return { label: dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: x.submissions,
                  tip: dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (x.averagePercent !== null ? ' · avg score ' + x.averagePercent + '%' : '') };
              })} />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2><span className="hicon"><Icon name="activity" size={16} /></span>Recent activity</h2>
        </div>
        {!d ? <Skeleton h={220} /> : !d.activity.length
          ? <EmptyState icon="activity">No activity yet.</EmptyState>
          : <ul className="activity">{d.activity.map((a, i) => {
              const [icon, tone] = activityIcon[a.type];
              const body = <><span className={'ic ' + tone}><Icon name={icon} size={17} /></span>
                <div className="txt"><b>{a.title}</b><span title={a.detail}>{a.detail}</span></div>
                <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>{timeAgo(a.at)}</time></>;
              return <li key={i}>{body}</li>;
            })}</ul>}
      </div>

      <div className="card">
        <div className="card-head">
          <h2><span className="hicon"><Icon name="calendar" size={16} /></span>Upcoming & live papers</h2>
          <Link className="link" to="/admin/schedule">View all</Link>
        </div>
        {!d ? <Skeleton h={220} /> : !d.upcoming.length
          ? <EmptyState icon="calendar">No upcoming or live papers. <Link className="link" to="/admin/papers/new">Create one</Link> or <Link className="link" to="/admin/schedule">schedule a paper</Link>.</EmptyState>
          : <div className="wrapx"><table>
              <thead><tr><th>Paper</th><th>Start time</th><th>Duration</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{d.upcoming.map(p => (
                <tr key={p._id}>
                  <td className="wrap" style={{ minWidth: 150 }}><b>{p.title}</b><div className="muted small-text">{p.code} · {p.questionCount} questions</div></td>
                  <td>{p.startsAt ? new Date(p.startsAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : <span className="muted">Open now</span>}</td>
                  <td>{duration(p)}</td>
                  <td><StatusBadge paper={p} /></td>
                  <td><Link className="btn outline small" to={'/admin/papers/' + p._id}>Manage</Link></td>
                </tr>
              ))}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-head"><h2><span className="hicon"><Icon name="bolt" size={16} /></span>Quick actions</h2></div>
        <div className="qa-grid">
          {quick.map(q => (
            <Link key={q.to} to={q.to} className="qa"><span className="ic"><Icon name={q.icon} size={20} /></span><b>{q.title}</b><span>{q.sub}</span></Link>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2><span className="hicon"><Icon name="checkCircle" size={16} /></span>Score distribution · all attempts</h2></div>
        {!d ? <Skeleton h={220} /> : d.submissions === 0
          ? <EmptyState icon="chart">No scores yet.</EmptyState>
          : <BarChart caption="Number of attempts per score range" valueName="Attempts"
              data={d.buckets.map(b => ({ label: b.label, value: b.count, tip: 'scored ' + b.label }))} />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2><span className="hicon"><Icon name="file" size={16} /></span>Latest results</h2>
          <Link className="link" to="/admin/results">View all</Link>
        </div>
        {!d ? <Skeleton h={220} /> : !d.latest.length
          ? <EmptyState>No results yet.</EmptyState>
          : <ul className="activity">{d.latest.map(r => (
              <li key={r._id}>
                <span className="avatar" style={{ width: 34, height: 34, fontSize: 14 }}>{r.name?.[0]?.toUpperCase() || '?'}</span>
                <div className="txt"><b>{r.name}</b><span>{r.roll} · {r.paperTitle}</span></div>
                <span className="badge info">{r.correct}/{r.total} · {r.percent}%</span>
              </li>
            ))}</ul>}
      </div>
    </div>
  </>);
}
