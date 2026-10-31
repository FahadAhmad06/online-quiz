// Direct unit tests for the Groq provider module (no DB, no Express app, no fallback orchestration -
// that's aiFallback.test.js): the real groq-sdk talking to a mocked Groq endpoint
// (helpers/fakeGroq.js). This module's job is narrow: attempt THIS provider, up to
// AI_MAX_ATTEMPTS_PER_PROVIDER times, and throw a classified error (.kind, .isAuthError,
// .providerRetryDelayMs) the orchestrator can act on - it has no cross-call memory of its own.
//   npm test   (runs every test/*.test.js file, each in its own process)
import './helpers/env.js';
process.env.GROQ_API_KEY = 'fake-groq-test-key';
process.env.GROQ_MODEL = process.env.GROQ_MODEL_TEST || 'groq-test-model';
process.env.AI_TIMEOUT_MS = '1000';
// Raised above the orchestrator's default of 1 specifically to exercise this module's own
// in-provider retry/backoff loop (attemptNum < maxAttempts path in evalRetryRunner.js).
process.env.AI_MAX_ATTEMPTS_PER_PROVIDER = '3';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeGroq } from './helpers/fakeGroq.js';

let fake, attempt, config;
before(async () => {
  fake = installFakeGroq({ latencyMs: 100 });
  ({ default: config } = await import('../src/config.js'));
  ({ default: attempt } = await import('../src/services/groqEvaluator.js'));
});
after(() => fake?.restore());

const question = { question: 'Explain X.', maxMarks: 10, rubric: 'r', keyConcepts: ['a'] };
let seq = 0;
const ask = (answer, over = {}) => attempt({ ...question, ...over, answer: answer + ' #' + ++seq });

test('valid answer: graded once, normalized result with usage and provider/model metadata', async () => {
  const c0 = fake.stats.calls;
  const { result, usage, meta } = await ask('a good answer');
  assert.equal(fake.stats.calls - c0, 1);
  assert.equal(result.suggestedMarks, 6); // mock default: 60% of maxMarks
  assert.ok(result.feedback.length > 0);
  assert.equal(result.needsManualReview, false);
  assert.ok(usage.total > 0, 'token usage recorded');
  assert.equal(meta.calls, 1);
  assert.equal(meta.provider, 'Groq');
  assert.equal(meta.model, config.groqModel);
});

test('partial marks are reported as given, not forced to a pass/fail extreme', async () => {
  const { result } = await ask('partial [[MARKS:3]]');
  assert.equal(result.suggestedMarks, 3);
});

test('a zero mark is preserved - never confused with a missing/invalid mark', async () => {
  const { result } = await ask('empty answer [[MARKS:0]]');
  assert.equal(result.suggestedMarks, 0);
});

test('marks above maxMarks are clamped to maxMarks and flagged for manual review', async () => {
  const { result } = await ask('over [[MARKS:15]]');
  assert.equal(result.suggestedMarks, 10);
  assert.equal(result.needsManualReview, true);
});

test('invalid (non-JSON) model output is retried up to AI_MAX_ATTEMPTS_PER_PROVIDER, then fails - never 0 marks', async () => {
  const c0 = fake.stats.calls;
  await assert.rejects(() => ask('junk [[BADJSONx9]]'), e => {
    assert.equal(e.kind, 'transient');
    assert.match(e.message, /not valid JSON/);
    assert.equal(e.isAuthError, false);
    return true;
  });
  assert.equal(fake.stats.calls - c0, 3);
});

test('a response with no usable mark is rejected, never silently graded as 0', async () => {
  await assert.rejects(() => ask('nomark [[NOMARK]]'), e => {
    assert.equal(e.kind, 'transient');
    assert.match(e.message, /without a valid mark/);
    return true;
  });
});

test('401 is a permanent, auth-flagged failure: one call, no retry, no key leaked in the message', async () => {
  const c0 = fake.stats.calls;
  await assert.rejects(() => ask('bad key [[401]]'), e => {
    assert.equal(e.kind, 'permanent');
    assert.equal(e.isAuthError, true);
    assert.match(e.message, /not authorized/);
    assert.ok(!e.message.includes('fake-groq-test-key'));
    return true;
  });
  assert.equal(fake.stats.calls - c0, 1);
});

test('temporary 5xx errors are retried within the run and can still succeed', async () => {
  const c0 = fake.stats.calls;
  const { result, meta } = await ask('retry me [[FAIL500x2]]');
  assert.equal(meta.calls, 3);
  assert.equal(fake.stats.calls - c0, 3);
  assert.equal(result.suggestedMarks, 6);
});

test('429 honors Retry-After before retrying, then succeeds', async () => {
  const t0 = Date.now();
  const { meta } = await ask('rate limited [[429x1:0.4s]]');
  assert.equal(meta.calls, 2);
  assert.ok(Date.now() - t0 >= 400, 'waited out the retry-after');
});

test('a very long Retry-After is reported on the error (for the orchestrator to schedule around), not waited out in-run', async () => {
  const t0 = Date.now();
  await assert.rejects(() => ask('quota [[429x9:300s]]'), e => {
    assert.equal(e.kind, 'transient');
    assert.ok(e.providerRetryDelayMs >= 300000, 'the raw provider delay is exposed: ' + e.providerRetryDelayMs);
    return true;
  });
  assert.ok(Date.now() - t0 < 2000, 'did not sit out the 300s itself');
});

test('timeout is bounded by AI_TIMEOUT_MS, reported as transient, and not retried in-run', async () => {
  const c0 = fake.stats.calls;
  const t0 = Date.now();
  await assert.rejects(() => ask('hang [[HANG]]'), e => {
    assert.equal(e.kind, 'transient');
    assert.match(e.message, /timed out/);
    return true;
  });
  assert.ok(Date.now() - t0 < 2500, 'bounded by the timeout, not left hanging');
  assert.equal(fake.stats.calls - c0, 1, 'a timed-out call is not retried within the same run');
});
