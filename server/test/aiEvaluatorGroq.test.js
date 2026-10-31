// Confirms Groq can be the PRIMARY provider (not just a fallback): with AI_PRIMARY_PROVIDER=groq
// and fallback disabled, evaluateAnswer reaches only Groq. subjectiveEvaluation.js and the admin
// routes only ever import aiEvaluator.js, never a specific provider, so this is what they call.
import './helpers/env.js';
process.env.AI_PRIMARY_PROVIDER = 'groq';
process.env.AI_FALLBACK_ENABLED = 'false';
process.env.GROQ_API_KEY = 'fake-groq-test-key';
process.env.GROQ_MODEL = 'groq-test-model';
// Deliberately leave GEMINI_API_KEY as the placeholder from helpers/env.js and never mock Gemini's
// endpoint - with fallback disabled a bug that still routed here would hit the real network (and
// fail loudly) rather than being silently satisfied by a mock.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeGroq } from './helpers/fakeGroq.js';

const fake = installFakeGroq({ latencyMs: 50 });
after(() => fake.restore());

const { default: evaluateAnswer, clearQuotaBlock, providerSnapshot } = await import('../src/services/aiEvaluator.js');

test('AI_PRIMARY_PROVIDER=groq, fallback disabled: evaluateAnswer reaches only Groq', async () => {
  const c0 = fake.stats.calls;
  const { result, meta } = await evaluateAnswer({ question: 'Q', maxMarks: 10, rubric: 'r', answer: 'an answer' });
  assert.equal(fake.stats.calls - c0, 1, 'the call went to Groq');
  assert.equal(meta.provider, 'Groq');
  assert.equal(meta.fallbackUsed, false);
  assert.equal(result.suggestedMarks, 6);
});

test('clearQuotaBlock() and providerSnapshot() work without a configured Gemini key', () => {
  clearQuotaBlock();
  const snap = providerSnapshot();
  assert.equal(snap.groq.state, 'available');
  assert.ok('gemini' in snap);
});
