// Subjective AI-evaluation tests: real Express app + real MongoDB (throwaway mongod) + the real
// @google/genai SDK talking to a mocked Gemini endpoint (helpers/fakeGemini.js).
//   npm test            (set MONGOD_PATH or TEST_MONGO_URI if mongod is not on PATH)
import './helpers/env.js';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMongod } from './helpers/mongod.js';
import { installFakeGemini } from './helpers/fakeGemini.js';

process.env.EVAL_CONCURRENCY = '3';
process.env.EVAL_MAX_RUNS = '3';
process.env.AI_TIMEOUT_MS = '1000';
process.env.AI_MAX_ATTEMPTS_PER_PROVIDER = '3'; // Gemini's own in-provider retry, as before fallback existed
// This file tests Gemini's own resilience end-to-end (through the real app/DB) in isolation from
// the fallback orchestration, which has its own dedicated coverage in aiFallback.test.js. Disabling
// fallback here means an unconfigured Groq (no GROQ_API_KEY in this env) never gets involved.
process.env.AI_FALLBACK_ENABLED = 'false';

let mongod, fake, server, base, Attempt, Student, Result, signToken, svc, mongoose, createPoller, clearQuotaBlock;
const ADMIN = () => 'Bearer ' + signToken({ email: 'owner@test.local', isSuper: true });

before(async () => {
  mongod = await startMongod();
  fake = installFakeGemini({ latencyMs: 150 });
  ({ default: mongoose } = await import('mongoose'));
  const { default: app } = await import('../src/app.js');
  const { default: connectDb } = await import('../src/db.js');
  ({ default: Attempt } = await import('../src/models/Attempt.js'));
  ({ default: Student } = await import('../src/models/Student.js'));
  ({ default: Result } = await import('../src/models/Result.js'));
  ({ default: signToken } = await import('../src/utils/signToken.js'));
  svc = await import('../src/services/subjectiveEvaluation.js');
  ({ clearQuotaBlock } = await import('../src/services/aiEvaluator.js'));
  ({ default: createPoller } = await import('../../client/src/utils/poller.js'));
  await connectDb();
  await mongoose.connection.db.dropDatabase();
  server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
// Gemini's availability state (providerAvailability.js) is process-wide and does not reset itself
// for a permanent/config error (by design - that needs an admin). Without this, one test's 401 or
// quota-exhaustion marker would leave Gemini looking broken for every later test in this file.
afterEach(() => clearQuotaBlock());
after(async () => {
  server?.close();
  await mongoose?.disconnect();
  fake?.restore();
  await mongod?.stop();
});

let seq = 0;
async function makeAttempt(answers, { mcq = 0 } = {}) {
  const n = ++seq;
  const student = await Student.create({ name: 'S' + n, rollNumber: 'R' + n, passwordHash: 'x' });
  const run = [
    ...Array.from({ length: mcq }, () => ({ type: 'mcq', text: 'Pick', options: ['a', 'b'], correct: 0 })),
    ...answers.map((_, i) => ({ type: 'subjective', text: 'Q' + i, maxMarks: 10, rubric: 'r' }))
  ];
  const a = await Attempt.create({
    paperCode: 'T' + n, paperTitle: 'T', name: student.name, roll: student.rollNumber, student: student._id,
    run, idx: run.length - 1, answers: run.map((q, i) => q.type === 'mcq' ? 0 : -1),
    subjectiveText: [...Array(mcq).fill(''), ...answers.map((t, i) => t + ' #' + n + '-' + i)]
  });
  return { id: String(a._id), auth: 'Bearer ' + signToken({ sub: String(student._id), roll: student.rollNumber, v: 0 }), subjStart: mcq };
}
const call = async (path, { method = 'GET', auth, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const submit = t => call('/attempts/' + t.id + '/submit', { method: 'POST', auth: t.auth, body: {} });
const evals = async id => (await Attempt.findById(id).lean()).evaluations;
async function settled(id, ms = 8000) {
  const until = Date.now() + ms;
  for (;;) {
    const e = await evals(id);
    if (e.length && e.every(x => !['pending', 'evaluating'].includes(x.status))) return e;
    if (Date.now() > until) throw new Error('not settled: ' + e.map(x => x.status).join(','));
    await new Promise(r => setTimeout(r, 15));
  }
}
const callsSince = c0 => fake.stats.calls - c0;

test('single answer: graded once, persisted with timings and token usage', async () => {
  const t = await makeAttempt(['Photosynthesis uses light']);
  const c0 = fake.stats.calls;
  const r = await submit(t);
  assert.equal(r.status, 200);
  assert.equal(r.body.pending, true);
  const [e] = await settled(t.id);
  assert.equal(e.status, 'awaiting_review');
  assert.equal(e.suggestedMarks, 6);
  assert.equal(e.claimToken, null);
  assert.equal(e.aiCalls, 1);
  assert.ok(e.durationMs >= 150 && e.aiMs >= 150, 'durations recorded');
  assert.ok(e.usage.total > 0, 'token usage recorded');
  assert.equal(callsSince(c0), 1);
});

test('multiple answers grade concurrently, capped at EVAL_CONCURRENCY', async () => {
  const t = await makeAttempt(['a', 'b', 'c', 'd', 'e', 'f']);
  const c0 = fake.stats.calls; fake.stats.maxInFlight = 0;
  const t0 = performance.now();
  await submit(t);
  const e = await settled(t.id);
  const ms = performance.now() - t0;
  assert.ok(e.every(x => x.status === 'awaiting_review'));
  assert.equal(callsSince(c0), 6);
  assert.equal(fake.stats.maxInFlight, 3, 'never more than 3 in flight');
  assert.ok(ms < 6 * 150, 'faster than sequential (' + Math.round(ms) + 'ms)');
});

test('concurrent submissions from several students share the same cap', async () => {
  const ts = await Promise.all([1, 2, 3, 4].map(() => makeAttempt(['x', 'y'])));
  const c0 = fake.stats.calls; fake.stats.maxInFlight = 0;
  await Promise.all(ts.map(submit));
  await Promise.all(ts.map(t => settled(t.id)));
  assert.equal(callsSince(c0), 8);
  assert.ok(fake.stats.maxInFlight <= 3);
});

test('duplicates: repeated submit, overlapping queue calls and sweeps never re-grade an answer', async () => {
  const t = await makeAttempt(['dup1 [[SLOW:300]]', 'dup2 [[SLOW:300]]']);
  const c0 = fake.stats.calls;
  const [first, second] = await Promise.all([submit(t), submit(t)]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  await Promise.all([svc.queueAttemptEvaluations(t.id), svc.queueAttemptEvaluations(t.id), svc.processPending(), svc.processPending()]);
  await settled(t.id);
  await svc.processPending();
  await svc.queueAttemptEvaluations(t.id);
  assert.equal(callsSince(c0), 2, 'exactly one Gemini call per answer');
});

test('transient 500s are retried within the run with backoff, then succeed', async () => {
  const t = await makeAttempt(['retry me [[FAIL500x2]]']);
  const c0 = fake.stats.calls;
  await submit(t);
  const [e] = await settled(t.id);
  assert.equal(e.status, 'awaiting_review');
  assert.equal(e.aiCalls, 3);
  assert.equal(e.retryCount, 0);
  assert.equal(callsSince(c0), 3);
});

test('429 honors the server retryDelay before retrying', async () => {
  const t = await makeAttempt(['rate [[429x1:0.4s]]']);
  await submit(t);
  const [e] = await settled(t.id);
  assert.equal(e.status, 'awaiting_review');
  assert.equal(e.aiCalls, 2);
  assert.ok(e.durationMs >= 400 + 2 * 150, 'waited for retryDelay (' + e.durationMs + 'ms)');
});

test('429 with a very long retryDelay (daily quota) fails fast as transient - not 0 marks, not a hang', async () => {
  const t = await makeAttempt(['quota [[429x9:300s]]']);
  const t0 = Date.now();
  await submit(t);
  const [e] = await settled(t.id);
  assert.ok(Date.now() - t0 < 3000);
  assert.equal(e.status, 'failed');
  assert.equal(e.failKind, 'transient');
  assert.equal(e.suggestedMarks, null);
  assert.match(e.failReason, /Gemini: AI grading hit a rate limit or quota\./);
  assert.ok(e.retryAfter > new Date(Date.now() + 250e3), 'reset time stored');
  assert.equal(e.retryCount, 0, 'a used-up quota does not count as a failed run');

  // While blocked: other answers fail at once without spending a Gemini request...
  const other = await makeAttempt(['blocked meanwhile']);
  const c0 = fake.stats.calls;
  await submit(other);
  const [o] = await settled(other.id);
  assert.equal(callsSince(c0), 0);
  assert.equal(o.status, 'failed');
  // ...the sweep and the student retry wait for the reset...
  await svc.processPending();
  assert.equal(callsSince(c0), 0);
  const sv = (await call('/attempts/' + other.id + '/result', { auth: other.auth })).body.subjective[0];
  assert.equal(sv.retryable, false);
  // ...and an admin re-evaluate lifts the block (e.g. after enabling billing) and really grades.
  const r = await call('/admin/subjective/submissions/' + other.id + '/0/re-evaluate', { method: 'POST', auth: ADMIN() });
  assert.equal(r.status, 200);
  const [after] = await settled(other.id);
  assert.equal(after.status, 'awaiting_review');
  assert.equal(after.retryAfter, null);
});

test('401 is permanent: one call, no retry, no marks, safe message without the key', async () => {
  const t = await makeAttempt(['bad key [[401]]']);
  const c0 = fake.stats.calls;
  await submit(t);
  const [e] = await settled(t.id);
  assert.equal(callsSince(c0), 1);
  assert.equal(e.status, 'failed');
  assert.equal(e.failKind, 'permanent');
  assert.equal(e.suggestedMarks, null);
  assert.equal(e.finalMarks, null);
  assert.ok(!e.failReason.includes('fake-test-key'));
  await svc.processPending(); // global sweep - may legitimately retry other tests' transient failures
  const [again] = await evals(t.id);
  assert.equal(again.status, 'failed');
  assert.equal(again.aiCalls, 1, 'sweep does not retry permanent failures');
  assert.equal(again.retryCount, 1);
});

test('malformed model output never becomes 0 marks', async () => {
  const t = await makeAttempt(['junk [[BADJSONx9]]', 'nomark [[NOMARK]]']);
  await submit(t);
  const e = await settled(t.id);
  for (const x of e) {
    assert.equal(x.status, 'failed');
    assert.equal(x.suggestedMarks, null);
    assert.equal(x.aiCalls, 3, 'retried up to AI_MAX_ATTEMPTS_PER_PROVIDER');
  }
});

test('out-of-range marks are clamped and flagged for manual review', async () => {
  const t = await makeAttempt(['over [[MARKS:15]]']);
  await submit(t);
  const [e] = await settled(t.id);
  assert.equal(e.suggestedMarks, 10);
  assert.equal(e.status, 'manual_review');
});

test('timeout: bounded by AI_TIMEOUT_MS, marked failed (transient), not retried in-run', async () => {
  const t = await makeAttempt(['hang [[HANG]]']);
  const c0 = fake.stats.calls;
  const t0 = Date.now();
  await submit(t);
  const [e] = await settled(t.id, 5000);
  assert.ok(Date.now() - t0 < 2500);
  assert.equal(callsSince(c0), 1);
  assert.equal(e.status, 'failed');
  assert.equal(e.failKind, 'transient');
  assert.match(e.failReason, /timed out/);
});

test('partial success: one failing answer does not affect the others', async () => {
  const t = await makeAttempt(['good one', 'bad [[401]]', 'good two']);
  await submit(t);
  const e = await settled(t.id);
  assert.deepEqual(e.map(x => x.status), ['awaiting_review', 'failed', 'awaiting_review']);
  assert.equal(e[0].suggestedMarks, 6);
  assert.equal(e[2].suggestedMarks, 6);
});

test('re-evaluation during an in-flight run: the older run cannot overwrite the newer result', async () => {
  const t = await makeAttempt(['race [[SLOW:400]] [[MARKSEQ:2,8]]']);
  await submit(t);
  await waitStatus(t.id, 'evaluating');
  const r = await call('/admin/subjective/submissions/' + t.id + '/0/re-evaluate', { method: 'POST', auth: ADMIN() });
  assert.equal(r.status, 200);
  const [e] = await settled(t.id);
  await new Promise(res => setTimeout(res, 500)); // let the first (superseded) run finish too
  const [after] = await evals(t.id);
  assert.equal(after.status, 'awaiting_review');
  assert.equal(after.suggestedMarks, 8, 'result of the newer run');
  assert.equal(e.suggestedMarks, 8);
});

test('admin approval during an in-flight run is not overwritten by the late AI result', async () => {
  const t = await makeAttempt(['approve race [[SLOW:400]]']);
  await submit(t);
  await waitStatus(t.id, 'evaluating');
  const r = await call('/admin/subjective/submissions/' + t.id + '/0/approve', { method: 'POST', auth: ADMIN(), body: { marks: 9, feedback: 'manual' } });
  assert.equal(r.status, 200);
  await new Promise(res => setTimeout(res, 600));
  const [e] = await evals(t.id);
  assert.equal(e.status, 'approved');
  assert.equal(e.finalMarks, 9);
});

async function waitStatus(id, status, ms = 3000) {
  const until = Date.now() + ms;
  while (!(await evals(id)).some(e => e.status === status)) {
    if (Date.now() > until) throw new Error('never reached ' + status);
    await new Promise(r => setTimeout(r, 10));
  }
}

test('restart recovery: expired claims are re-graded; live claims are left alone', async () => {
  const dead = await makeAttempt(['dead run']);
  const live = await makeAttempt(['live run']);
  const old = new Date(Date.now() - svc.LEASE_MS - 1000);
  for (const [t, claimedAt, claimToken] of [[dead, old, 'dead-token'], [live, new Date(), 'live-token']]) {
    await Attempt.updateOne({ _id: t.id }, { submitted: true, needsGrading: true,
      evaluations: [{ idx: 0, status: 'evaluating', maxMarks: 10, claimedAt, claimToken }] });
  }
  await svc.processPending();
  const [d] = await settled(dead.id);
  assert.equal(d.aiCalls, 1);
  assert.equal(d.status, 'awaiting_review', 'dead run re-graded, never silently completed');
  const [l] = await evals(live.id);
  assert.equal(l.status, 'evaluating');
  assert.equal(l.claimToken, 'live-token');
  assert.equal(l.aiCalls, 0, 'live claim not re-graded');
});

test('sweep retries transient failures up to EVAL_MAX_RUNS, then stops', async () => {
  const t = await makeAttempt(['flaky [[FAIL500x12]]']); // 3 calls per run -> fails runs 1-3, would pass on run 5
  await submit(t);
  let [e] = await settled(t.id);
  assert.equal(e.retryCount, 1);
  for (let i = 0; i < 4; i++) { await svc.processPending(); [e] = await settled(t.id); }
  assert.equal(e.status, 'failed');
  assert.equal(e.retryCount, 3, 'capped at EVAL_MAX_RUNS');
});

test('sweep also retries failures saved by the old code ("rate limit ... it will be retried")', async () => {
  const t = await makeAttempt(['legacy']);
  await Attempt.updateOne({ _id: t.id }, { submitted: true, needsGrading: true, evaluations: [{ idx: 0, status: 'failed', maxMarks: 10, retryCount: 1,
    failReason: 'AI grading hit a rate limit or quota; it will be retried.' }] });
  await svc.processPending();
  const [e] = await settled(t.id);
  assert.equal(e.status, 'awaiting_review');
  assert.equal(e.suggestedMarks, 6);
});

test('rate gate: a 429 pause holds every caller; rpm spaces call starts', async () => {
  const { default: createRateGate } = await import('../src/utils/rateGate.js');
  const g = createRateGate(0);
  g.pause(300);
  let t0 = Date.now();
  await Promise.all([g.wait(), g.wait(), g.wait()]);
  assert.ok(Date.now() - t0 >= 290, 'all callers waited out the pause');
  const paced = createRateGate(600); // one start per 100ms
  t0 = Date.now();
  const starts = [];
  await Promise.all([0, 1, 2, 3].map(async () => { await paced.wait(); starts.push(Date.now() - t0); }));
  starts.sort((a, b) => a - b);
  assert.ok(starts[3] >= 290, 'four starts spread over >= 300ms: ' + starts);
});

test('student status endpoint: read-only, ownership enforced, no marks before approval, accurate progress', async () => {
  const t = await makeAttempt(['s1 [[SLOW:300]]', 's2 [[401]]'], { mcq: 2 });
  await submit(t);
  const c0 = fake.stats.calls;
  const r = await call('/attempts/' + t.id + '/result', { auth: t.auth });
  assert.equal(r.status, 200);
  assert.equal(r.body.approvalRequired, true);
  assert.equal(r.body.progress.total, 2);

  await settled(t.id);
  const before = fake.stats.calls;
  for (let i = 0; i < 5; i++) await call('/attempts/' + t.id + '/result', { auth: t.auth });
  assert.equal(fake.stats.calls, before, 'polling never triggers Gemini');

  const done = (await call('/attempts/' + t.id + '/result', { auth: t.auth })).body;
  assert.deepEqual({ ...done.progress }, { total: 2, evaluated: 1, approved: 0, pending: 0, evaluating: 0, failed: 1 });
  const [s1, s2] = done.subjective;
  assert.equal(s1.status, 'awaiting_review');
  assert.equal(s1.marks, undefined, 'AI marks hidden before approval');
  assert.equal(s1.feedback, undefined);
  assert.equal(s2.status, 'failed');
  assert.equal(s2.retryable, false, 'permanent failure is not student-retryable');
  assert.ok(!JSON.stringify(done).includes('GEMINI_API_KEY'), 'admin-facing failReason not exposed');
  assert.ok(!JSON.stringify(done).includes('rubric'));

  const other = await makeAttempt(['other']);
  assert.equal((await call('/attempts/' + t.id + '/result', { auth: other.auth })).status, 403);
  assert.ok(callsSince(c0) <= 2);
});

test('approval flow: per-question marks appear once approved; Result created when all approved', async () => {
  const t = await makeAttempt(['p1', 'p2'], { mcq: 1 });
  await submit(t);
  await settled(t.id);
  const q = i => '/admin/subjective/submissions/' + t.id + '/' + (t.subjStart + i);
  assert.equal((await call(q(0) + '/approve', { method: 'POST', auth: ADMIN(), body: {} })).status, 200);
  let r = (await call('/attempts/' + t.id + '/result', { auth: t.auth })).body;
  assert.equal(r.pending, true);
  assert.equal(r.subjective[0].marks, 6);
  assert.equal(r.subjective[1].marks, undefined);
  assert.equal(await Result.countDocuments({ attempt: t.id }), 0);
  await call(q(1) + '/approve', { method: 'POST', auth: ADMIN(), body: { marks: 4 } });
  r = (await call('/attempts/' + t.id + '/result', { auth: t.auth })).body;
  assert.equal(r.pending, false);
  assert.equal(r.correct, 1 + 6 + 4);
  assert.equal(r.total, 1 + 20);
  const res = await Result.findOne({ attempt: t.id }).lean();
  assert.equal(res.correct, 11);
});

test('student retry: allowed for own transient failure only, resumes grading', async () => {
  const t = await makeAttempt(['retry [[FAIL500x3]]']); // fails run 1 (3 calls), succeeds on run 2
  await submit(t);
  await settled(t.id);
  // The failed provider gets a brief (AI_RETRY_BASE_DELAY_MS-scale) backoff before it's considered
  // available again, which retryable also respects - wait that out rather than racing it.
  let r;
  const until = Date.now() + 1000;
  do {
    r = (await call('/attempts/' + t.id + '/result', { auth: t.auth })).body;
    if (!r.subjective[0].retryable) await new Promise(res => setTimeout(res, 10));
  } while (!r.subjective[0].retryable && Date.now() < until);
  assert.equal(r.subjective[0].status, 'failed');
  assert.equal(r.subjective[0].retryable, true);
  const other = await makeAttempt(['x']);
  assert.equal((await call('/attempts/' + t.id + '/subjective/0/retry', { method: 'POST', auth: other.auth })).status, 403);
  const ok = await call('/attempts/' + t.id + '/subjective/0/retry', { method: 'POST', auth: t.auth });
  assert.equal(ok.status, 200);
  assert.equal((await call('/attempts/' + t.id + '/subjective/0/retry', { method: 'POST', auth: t.auth })).status, 409, 'not while running');
  const [e] = await settled(t.id);
  assert.equal(e.status, 'awaiting_review');

  const perm = await makeAttempt(['p [[401]]']);
  await submit(perm);
  await settled(perm.id);
  assert.equal((await call('/attempts/' + perm.id + '/subjective/0/retry', { method: 'POST', auth: perm.auth })).status, 409);
});

test('admin endpoints: detail hides claimToken, metrics needs admin and reports timings', async () => {
  const t = await makeAttempt(['m']);
  await submit(t);
  await settled(t.id);
  const d = await call('/admin/subjective/submissions/' + t.id, { auth: ADMIN() });
  assert.equal(d.status, 200);
  assert.ok(!('claimToken' in d.body.questions[0].evaluation));
  assert.ok(d.body.questions[0].evaluation.durationMs > 0);
  assert.equal((await call('/admin/subjective/metrics')).status, 401);
  assert.equal((await call('/admin/subjective/metrics', { auth: t.auth })).status, 401);
  const m = (await call('/admin/subjective/metrics', { auth: ADMIN() })).body;
  assert.ok(m.counters.evaluated > 0 && m.counters.failed > 0 && m.counters.retries > 0 && m.counters.rateLimited > 0 && m.counters.timeouts > 0);
  for (const k of ['totalMs', 'aiMs', 'callMs', 'queueWaitMs', 'dbReadMs', 'dbWriteMs']) assert.ok(m[k].n > 0 && m[k].p95 >= m[k].p50, k);
  assert.ok(!JSON.stringify(m).includes('fake-test-key'));
  const list = (await call('/admin/subjective/submissions', { auth: ADMIN() })).body;
  assert.ok(list.items.every(i => typeof i.aiActive === 'number'));
});

test('admin can delete a submission (attempt + its Result); students and anonymous users cannot', async () => {
  const t = await makeAttempt(['del'], { mcq: 1 });
  await submit(t);
  await settled(t.id);
  await call('/admin/subjective/submissions/' + t.id + '/1/approve', { method: 'POST', auth: ADMIN(), body: {} });
  assert.equal(await Result.countDocuments({ attempt: t.id }), 1);
  assert.equal((await call('/admin/subjective/submissions/' + t.id, { method: 'DELETE' })).status, 401);
  assert.equal((await call('/admin/subjective/submissions/' + t.id, { method: 'DELETE', auth: t.auth })).status, 401);
  assert.equal((await call('/admin/subjective/submissions/' + t.id, { method: 'DELETE', auth: ADMIN() })).status, 200);
  assert.equal(await Attempt.countDocuments({ _id: t.id }), 0);
  assert.equal(await Result.countDocuments({ attempt: t.id }), 0);
  assert.equal((await call('/admin/subjective/submissions/' + t.id, { method: 'DELETE', auth: ADMIN() })).status, 404);
});

// End-to-end "no reload" check: the client's own poller (client/src/utils/poller.js) watching the
// student's status endpoint during a real grading run must observe each transition by itself.
test('client poller observes pending -> evaluating -> awaiting approval without a reload', async () => {
  const t = await makeAttempt(['live [[SLOW:600]]', 'live2 [[SLOW:600]]', 'live3 [[SLOW:600]]', 'live4 [[SLOW:700]]']);
  // 4 answers, 3 slots: the last answer genuinely waits in 'pending'.
  const seen = [];
  let finished;
  const done = new Promise(r => { finished = r; });
  const poller = createPoller({
    fetcher: async () => (await call('/attempts/' + t.id + '/result', { auth: t.auth })).body,
    onData: d => seen.push(d.subjective.map(s => s.status).join(',') + ' | ' + d.progress.evaluated + '/' + d.progress.total),
    interval: d => d.progress.pending || d.progress.evaluating ? 100 : null,
    onStatus: s => s === 'done' && finished(),
    env: {}
  });
  await submit(t);
  poller.start();
  await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('poller never finished: ' + seen.join(' / '))), 8000))]);
  poller.stop();
  const statuses = seen.join(' / ');
  assert.match(statuses, /evaluating/);
  assert.match(statuses, /pending/, 'saw an answer waiting for a slot: ' + statuses);
  assert.match(seen.at(-1), /^awaiting_review,awaiting_review,awaiting_review,awaiting_review \| 4\/4$/);
  const evaluatedCounts = seen.map(s => Number(/\| (\d)/.exec(s)[1]));
  assert.ok(evaluatedCounts.some(n => n > 0 && n < 4), 'per-answer progress observed before completion: ' + statuses);
});
