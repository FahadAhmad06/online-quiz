import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import createPoller from '../utils/poller';

// While AI grading is actively running / while only slower changes (admin decisions, new
// submissions) are expected. VITE_EVAL_POLL_MS overrides the fast interval at build time.
export const POLL_FAST = Number(import.meta.env.VITE_EVAL_POLL_MS) || 2500;
export const POLL_SLOW = 15000;

// GET a path now, then keep it fresh. interval(data) returns the next delay in ms, or null once
// nothing can change any more. Returns { data, loading, error, live, reload } - error is set
// only when there is no data yet; afterwards a failed poll keeps the last data and live='retrying'.
// One loop per mounted path: changing the path or unmounting stops it and aborts its request.
export default function usePoll(path, interval) {
  const [state, setState] = useState({ data: null, loading: true, error: '', live: 'live' });
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const poller = useRef(null);

  useEffect(() => {
    if (!path) return undefined;
    setState(s => ({ ...s, loading: true, error: '' }));
    const p = createPoller({
      fetcher: signal => api(path, { signal, cache: 'no-store' }),
      interval: d => intervalRef.current(d),
      onData: data => setState(s => ({ ...s, data, loading: false, error: '' })),
      onError: e => setState(s => ({ ...s, loading: false, error: s.data ? '' : e.message })),
      onStatus: live => setState(s => s.live === live ? s : { ...s, live })
    });
    poller.current = p;
    p.start();
    return () => { p.stop(); if (poller.current === p) poller.current = null; };
  }, [path]);

  return { ...state, reload: () => poller.current?.refresh() };
}
