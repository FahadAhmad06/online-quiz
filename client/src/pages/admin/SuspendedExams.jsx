import { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';
import Icon from '../../components/Icon';
import api from '../../utils/api';
import { useConfirm, useToast } from '../../components/Feedback';

export default function SuspendedExams() {
  const suspended = useFetch('/admin/suspended');
  const confirm = useConfirm();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const resumeExam = async attempt => {
    if (!(await confirm({
      title: 'Allow this student to resume?',
      message: 'Resume ' + attempt.studentName + ' on ' + attempt.paperTitle + '? The original exam deadline remains unchanged.',
      confirmText: 'Resume exam',
      danger: false
    }))) return;

    try {
      setBusyId(attempt._id);
      await api('/admin/attempts/' + attempt._id + '/resume', { method: 'POST' });
      suspended.reload();
      toast.ok('Examination resumed for ' + attempt.studentName + '.');
    } catch (e) {
      toast.bad(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (<>
    <PageHeader title="Resume Requests" subtitle="Students whose exam was paused after repeated tab switches can continue without starting a new attempt." />
    <div className="card">
      {suspended.state?.error ? <ErrorBox message={suspended.state.error} onRetry={suspended.reload} />
        : !suspended.data ? <Loading />
        : !suspended.data.length ? <EmptyState icon="clock">No suspended examinations need approval right now.</EmptyState>
        : (<div className="wrapx"><table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Quiz</th>
                <th>Violations</th>
                <th>Suspended</th>
                <th>Reason</th>
                <th>Remaining</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>{suspended.data.map(a => (
              <tr key={a._id}>
                <td><b>{a.studentName}</b><div className="muted small-text">{a.studentEmail}</div></td>
                <td className="wrap"><b>{a.paperTitle}</b><div className="muted small-text">{a.paperCode}</div></td>
                <td><span className="badge warn"><Icon name="alert" size={15} /> {a.tabSwitchCount || 0}/3</span></td>
                <td>{new Date(a.suspendedAt).toLocaleString()}</td>
                <td className="wrap" style={{ maxWidth: 260 }}>{a.suspensionReason}</td>
                <td>{Math.max(0, Math.ceil((a.remainingTime || 0) / 60000))} min</td>
                <td>
                  <button className="small" disabled={busyId === a._id} onClick={() => resumeExam(a)}>
                    {busyId === a._id ? 'Resuming…' : 'Allow resume'}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>)}
    </div>
  </>);
}
