// Direct unit tests for the two-way Gemini<->Groq fallback orchestrator (aiEvaluator.js), with both
// providers mocked (helpers/fakeGemini.js + helpers/fakeGroq.js) so the same test can exercise
// "Gemini down, Groq picks it up" and vice versa. No DB/app - duplicate-prevention, admin approval
// etc. are provider-agnostic and already covered (with a single provider) in evaluation.test.js.
import './helpers/env.js';
process.env.AI_PRIMARY_PROVIDER = 'gemini';
process.env.AI_FALLBACK_ENABLED = 'true';
process.env.GEMINI_API_KEY = 'fake-gemini-test-key';
process.env.GEMINI_MODEL = 'gemini-test-model';
process.env.GROQ_API_KEY = 'fake-groq-test-key';
process.env.GROQ_MODEL = 'groq-test-model';
process.env.AI_TIMEOUT_MS = '1000';
process.env.AI_MAX_ATTEMPTS_PER_PROVIDER = '1';
process.env.AI_RETRY_BASE_DELAY_MS = '50';
process.env.AI_RETRY_MAX_DELAY_MS = '2000'; // short so "provider recovers" tests don't need to sleep long

import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeGemini } from './helpers/fakeGemini.js';
import { installFakeGroq } from './helpers/fakeGroq.js';

let gemini, groq, evaluateAnswer, clearQuotaBlock;
before(async () => {
  gemini = installFakeGemini({ latencyMs: 60 });
  groq = installFakeGroq({ latencyMs: 60 }); // installs on top of fakeGemini's fetch; both coexist
  ({ default: evaluateAnswer, clearQuotaBlock } = await import('../src/services/aiEvaluator.js'));
});
after(() => { groq?.restore(); gemini?.restore(); });
// Provider availability is process-wide and persists until its own backoff passes (by design) -
// without resetting it between tests, one test's failure marker would leak into the next.
afterEach(() => clearQuotaBlock());

const question = { question: 'Explain X.', maxMarks: 10, rubric: 'r', keyConcepts: ['a'] };
let seq = 0;
const ask = answer => evaluateAnswer({ ...question, answer: answer + ' #' + ++seq });
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('Gemini succeeds: Groq is never called', async () => {
  const g0 = gemini.stats.calls, q0 = groq.stats.calls;
  const { result, meta } = await ask('a good answer');
  assert.equal(gemini.stats.calls - g0, 1);
  assert.equal(groq.stats.calls - q0, 0, 'Groq was not touched');
  assert.equal(result.suggestedMarks, 6);
  assert.equal(meta.provider, 'Gemini');
  assert.equal(meta.fallbackUsed, false);
});

test('Gemini quota exhausted (very long retry delay) -> Groq succeeds, fallback recorded', async () => {
  const g0 = gemini.stats.calls, q0 = groq.stats.calls;
  const { result, meta } = await ask('gq [[G:429x9:300s]]');
  assert.equal(gemini.stats.calls - g0, 1, 'Gemini was tried exactly once, not retried in-run');
  assert.equal(groq.stats.calls - q0, 1, 'Groq picked it up');
  assert.equal(result.suggestedMarks, 6);
  assert.equal(meta.provider, 'Groq');
  assert.equal(meta.fallbackUsed, true);
  assert.deepEqual(meta.providersAttempted, ['gemini', 'groq']);
});

test('Gemini timeout -> Groq succeeds', async () => {
  const g0 = gemini.stats.calls, q0 = groq.stats.calls;
  const { meta } = await ask('gt [[G:HANG]]');
  assert.equal(gemini.stats.calls - g0, 1);
  assert.equal(groq.stats.calls - q0, 1);
  assert.equal(meta.provider, 'Groq');
});

test('Gemini temporary 5xx -> Groq succeeds', async () => {
  const { meta } = await ask('g5 [[G:FAIL500x9]]');
  assert.equal(meta.provider, 'Groq');
  assert.equal(meta.fallbackUsed, true);
});

test('Gemini malformed/unusable output -> treated as transient, Groq succeeds', async () => {
  const { meta } = await ask('gbad [[G:BADJSONx9]]');
  assert.equal(meta.provider, 'Groq');
});

test('Gemini invalid API key: Groq is NOT tried - auth/config errors never trigger fallback', async () => {
  const q0 = groq.stats.calls;
  await assert.rejects(() => ask('gauth [[G:401]]'), e => {
    assert.equal(e.kind, 'permanent');
    assert.match(e.message, /Gemini: /);
    return true;
  });
  assert.equal(groq.stats.calls, q0, 'Groq was never called for a Gemini auth error');
});

test('both providers exhausted: evaluation stays transient/pending, bounded calls, no infinite loop', async () => {
  const uniqueAnswer = 'both-down [[429x9:300s]]';
  const g0 = gemini.stats.calls, q0 = groq.stats.calls;
  const ans = uniqueAnswer + ' #' + ++seq;
  await assert.rejects(() => evaluateAnswer({ ...question, answer: ans }), e => {
    assert.equal(e.kind, 'transient');
    assert.ok(e.retryAfter instanceof Date);
    assert.match(e.message, /Gemini: .*Groq: /s);
    return true;
  });
  assert.equal(gemini.stats.calls - g0, 1);
  assert.equal(groq.stats.calls - q0, 1);

  // Immediately retrying (simulating an overlapping sweep) spends NO further calls: both providers
  // are already known-down, so neither is actually called again until its own backoff passes.
  const g1 = gemini.stats.calls, q1 = groq.stats.calls;
  await assert.rejects(() => evaluateAnswer({ ...question, answer: 'retry-now #' + ++seq }));
  assert.equal(gemini.stats.calls, g1, 'Gemini not called again while still in backoff');
  assert.equal(groq.stats.calls, q1, 'Groq not called again while still in backoff');
});

test('a provider recovers automatically once its backoff window passes, without any manual switch', async () => {
  // Drive Gemini into a quota block (scoped, so Groq still succeeds this one call via fallback;
  // AI_RETRY_MAX_DELAY_MS=2000 clamps how long Gemini is actually skipped for).
  const { meta: m0 } = await ask('recover-gemini [[G:429x9:300s]]');
  assert.equal(m0.provider, 'Groq', 'Groq picked up the slack while Gemini was blocked');
  await sleep(2600); // longer than the clamped backoff (2000ms) plus its up-to-20% jitter ceiling
  const g0 = gemini.stats.calls;
  const { meta } = await ask('after recovery');
  assert.equal(gemini.stats.calls - g0, 1, 'Gemini was actually retried, not skipped');
  assert.equal(meta.provider, 'Gemini', 'Gemini is used again once available, not stuck on Groq');
});

test('invalid AI output is rejected safely and marks never exceed maxMarks, however it was graded', async () => {
  const { result } = await ask('over [[MARKS:999]]');
  assert.equal(result.suggestedMarks, 10);
  assert.equal(result.needsManualReview, true);
});
