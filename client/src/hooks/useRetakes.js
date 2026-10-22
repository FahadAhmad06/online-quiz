import { useState } from 'react';
import useFetch from './useFetch';
import api from '../utils/api';
import { useConfirm, useToast } from '../components/Feedback';

// Retake state from GET /admin/retakes plus allow/cancel actions (POST /admin/retakes, /admin/retakes/cancel).
// `tableProps` plugs straight into <ResultsTable>.
export default function useRetakes(query = '') {
  const state = useFetch('/admin/retakes' + query), toast = useToast(), confirm = useConfirm();
  const [pending, setPending] = useState(''); // key of the row being changed
  const key = r => r.roll + '|' + r.paperCode;
  const rows = state.data || [];
  const allowedSet = new Set(rows.filter(g => g.retakeAllowed).map(key));
  const cancelledSet = new Set(rows.filter(g => g.retakeCancelled).map(key));
  const run = async (r, path, okText) => {
    setPending(key(r));
    try { await api(path, { method: 'POST', body: { rollNumber: r.roll, paperCode: r.paperCode } }); toast.ok(okText); state.reload(); }
    catch (e) { toast.bad(e.message); }
    setPending('');
  };
  const allow = r => run(r, '/admin/retakes', 'Retake allowed for ' + r.name + ' (' + r.roll + ') on ' + r.paperCode + '.');
  const cancel = async r => {
    if (!(await confirm({ title: 'Cancel this retake?', message: r.name + ' (' + r.roll + ') will no longer be able to retake ' + r.paperCode + '.', confirmText: 'Cancel retake', cancelText: 'Keep it' }))) return;
    run(r, '/admin/retakes/cancel', 'Retake cancelled for ' + r.name + ' (' + r.roll + ') on ' + r.paperCode + '.');
  };
  return {
    state, rows, allow, cancel, pending, key,
    tableProps: {
      onAllowRetake: allow, onCancelRetake: cancel, retakePending: r => pending === key(r),
      retakeAllowed: r => allowedSet.has(key(r)), retakeCancelled: r => cancelledSet.has(key(r))
    }
  };
}
