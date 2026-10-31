// Framework-free polling loop (wrapped by hooks/usePoll; unit-tested in Node).
// - one request in flight at a time; the next is scheduled only after it settles, so slow
//   responses never pile up or arrive out of order
// - interval(data) picks the next delay from the latest data; null = finished, stop polling
// - errors back off exponentially; 4xx other than 408/429 (gone, forbidden) stop the loop
// - paused while the tab is hidden, refreshed immediately when it becomes visible or the
//   browser comes back online, so missed updates are recovered from the server's state
// - stops after idleStopMs with no change in the data (resumable via refresh())
// onStatus receives 'live' | 'retrying' | 'done' | 'idle' | 'error'.
export default function createPoller({
  fetcher, onData, onError, onStatus, interval,
  errorBaseMs = 2000, maxBackoffMs = 60000, idleStopMs = 30 * 60e3,
  env = globalThis, now = () => Date.now()
}) {
  const doc = env.document, win = env.window || env;
  let timer = null, ctrl = null, stopped = false, finished = null, failures = 0;
  let lastJson, lastChange = now(), due = false;

  const hidden = () => doc?.visibilityState === 'hidden';
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const schedule = ms => { clear(); timer = setTimeout(tick, ms); };
  const finish = why => { finished = why; clear(); onStatus?.(why); };

  async function tick() {
    timer = null;
    if (stopped || finished || ctrl) return;
    if (hidden()) { due = true; return; } // resumes from onVisible
    due = false;
    const mine = ctrl = new AbortController();
    try {
      const data = await fetcher(mine.signal);
      if (mine !== ctrl) return; // stopped or refreshed meanwhile
      ctrl = null;
      const json = JSON.stringify(data);
      if (json !== lastJson || failures) { lastJson = json; lastChange = now(); onData(data); }
      failures = 0;
      const next = interval(data);
      if (next == null) return finish('done');
      if (now() - lastChange > idleStopMs) return finish('idle');
      onStatus?.('live');
      schedule(next);
    } catch (e) {
      if (mine !== ctrl) return;
      ctrl = null;
      onError?.(e);
      if (e?.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) return finish('error');
      failures++;
      onStatus?.('retrying');
      schedule(Math.min(maxBackoffMs, errorBaseMs * 2 ** (failures - 1)));
    }
  }

  function refresh() {
    if (stopped) return;
    ctrl?.abort(); ctrl = null;
    clear(); finished = null; failures = 0; lastChange = now();
    tick();
  }
  const onVisible = () => {
    if (hidden() || stopped) return;
    if (finished === 'idle') return refresh();
    if (!finished && (due || timer)) { clear(); tick(); }
  };
  const onOnline = () => { if (!stopped && !finished) { clear(); tick(); } };

  return {
    start() {
      doc?.addEventListener?.('visibilitychange', onVisible);
      win?.addEventListener?.('online', onOnline);
      tick();
    },
    refresh,
    stop() {
      stopped = true; clear(); ctrl?.abort(); ctrl = null;
      doc?.removeEventListener?.('visibilitychange', onVisible);
      win?.removeEventListener?.('online', onOnline);
    }
  };
}
