// Unit tests for the polling loop behind usePoll().   node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import createPoller from '../src/utils/poller.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
function fakeEnv() {
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const win = new EventTarget();
  return { env: { document: doc, window: win }, doc, win,
    hide() { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); },
    show() { doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); } };
}
function harness(opts = {}) {
  const calls = [], data = [], statuses = [];
  const fx = fakeEnv();
  const p = createPoller({
    fetcher: async signal => { calls.push({ at: performance.now(), signal }); return opts.fetch ? opts.fetch(calls.length, signal) : { n: calls.length }; },
    onData: d => data.push(d), onStatus: s => statuses.push(s), interval: opts.interval || (() => 20),
    errorBaseMs: 20, idleStopMs: opts.idleStopMs ?? 60e3, env: fx.env
  });
  return { p, calls, data, statuses, ...fx };
}

test('fetches immediately, then on the interval, and stops when interval returns null', async () => {
  const h = harness({ interval: d => d.n >= 3 ? null : 15 });
  h.p.start();
  assert.equal(h.calls.length, 1, 'immediate first request');
  await sleep(120);
  assert.equal(h.calls.length, 3);
  assert.equal(h.statuses.at(-1), 'done');
  h.p.stop();
});

const slowFetch = state => async (n, signal) => {
  state.inFlight++; state.peak = Math.max(state.peak, state.inFlight);
  try {
    await new Promise((res, rej) => { const t = setTimeout(res, 40); signal.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason); }); });
    return { n };
  } finally { state.inFlight--; }
};

test('never overlaps requests: a slow response delays the next poll instead of stacking', async () => {
  const st = { inFlight: 0, peak: 0 };
  const h = harness({ fetch: slowFetch(st), interval: () => 5 });
  try {
    h.p.start();
    await sleep(200);
    assert.equal(st.peak, 1);
    assert.ok(h.calls.length >= 3 && h.calls.length <= 5, 'paced by response time: ' + h.calls.length);
  } finally { h.p.stop(); }
});

test('refresh aborts the in-flight request and its late response is never applied', async () => {
  const h = harness({ fetch: slowFetch({ inFlight: 0, peak: 0 }), interval: () => null });
  try {
    h.p.start();
    await sleep(10);
    h.p.refresh();
    assert.equal(h.calls[0].signal.aborted, true, 'first request aborted');
    await sleep(80);
    assert.deepEqual(h.data, [{ n: 2 }]);
  } finally { h.p.stop(); }
});

test('backs off exponentially on errors, recovers on success', async () => {
  const h = harness({ fetch: n => { if (n <= 3) { const e = new Error('net'); e.status = 0; throw e; } return { ok: n }; }, interval: () => null });
  h.p.start();
  await sleep(250);
  const gaps = h.calls.slice(1).map((c, i) => c.at - h.calls[i].at);
  assert.equal(h.calls.length, 4);
  assert.ok(gaps[0] >= 18 && gaps[1] >= 38 && gaps[2] >= 78, 'gaps grow: ' + gaps.map(Math.round));
  assert.deepEqual(h.statuses.filter(s => s === 'retrying').length, 3);
  assert.equal(h.statuses.at(-1), 'done');
  assert.deepEqual(h.data, [{ ok: 4 }]);
});

test('stops on a permanent 4xx (not found / forbidden)', async () => {
  const h = harness({ fetch: () => { const e = new Error('gone'); e.status = 404; throw e; } });
  h.p.start();
  await sleep(80);
  assert.equal(h.calls.length, 1);
  assert.equal(h.statuses.at(-1), 'error');
});

test('pauses while the tab is hidden and refreshes as soon as it is visible', async () => {
  const h = harness({ interval: () => 15 });
  h.p.start();
  await sleep(40);
  h.hide();
  await sleep(10);
  const whenHidden = h.calls.length;
  await sleep(120);
  assert.ok(h.calls.length <= whenHidden + 1, 'no polling while hidden');
  const before = h.calls.length;
  h.show();
  assert.equal(h.calls.length, before + 1, 'immediate refresh on visible');
  h.p.stop();
});

test('coming back online triggers an immediate refresh', async () => {
  const h = harness({ interval: () => 10e3 });
  h.p.start();
  await sleep(10);
  h.win.dispatchEvent(new Event('online'));
  assert.equal(h.calls.length, 2);
  h.p.stop();
});

test('only reports changed data, goes idle after no change, refresh resumes', async () => {
  const h = harness({ fetch: () => ({ same: true }), interval: () => 10, idleStopMs: 60 });
  h.p.start();
  await sleep(150);
  assert.equal(h.data.length, 1, 'unchanged responses are not re-applied');
  assert.equal(h.statuses.at(-1), 'idle');
  const n = h.calls.length;
  await sleep(50);
  assert.equal(h.calls.length, n, 'idle means stopped');
  h.p.refresh();
  assert.equal(h.calls.length, n + 1);
  h.p.stop();
});

test('stop() aborts the request and cancels timers', async () => {
  const h = harness({ fetch: (n, signal) => new Promise((res, rej) => signal.addEventListener('abort', () => rej(signal.reason))) });
  h.p.start();
  h.p.stop();
  assert.equal(h.calls[0].signal.aborted, true);
  await sleep(60);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.statuses, []);
});
