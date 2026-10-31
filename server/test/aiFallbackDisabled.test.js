// AI_FALLBACK_ENABLED=false must behave like a single-provider setup: Gemini failing (even
// transiently) must never cause Groq to be called, regardless of how well-configured Groq is.
import './helpers/env.js';
process.env.AI_PRIMARY_PROVIDER = 'gemini';
process.env.AI_FALLBACK_ENABLED = 'false';
process.env.GEMINI_API_KEY = 'fake-gemini-test-key';
process.env.GEMINI_MODEL = 'gemini-test-model';
process.env.GROQ_API_KEY = 'fake-groq-test-key';
process.env.GROQ_MODEL = 'groq-test-model';
process.env.AI_TIMEOUT_MS = '1000';
process.env.AI_MAX_ATTEMPTS_PER_PROVIDER = '1';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeGemini } from './helpers/fakeGemini.js';
import { installFakeGroq } from './helpers/fakeGroq.js';

let gemini, groq, evaluateAnswer;
before(async () => {
  gemini = installFakeGemini({ latencyMs: 60 });
  groq = installFakeGroq({ latencyMs: 60 });
  ({ default: evaluateAnswer } = await import('../src/services/aiEvaluator.js'));
});
after(() => { groq?.restore(); gemini?.restore(); });

test('fallback disabled: a transient Gemini failure never reaches Groq', async () => {
  const q0 = groq.stats.calls;
  await assert.rejects(() => evaluateAnswer({ question: 'Q', maxMarks: 10, rubric: 'r', answer: 'x [[429x9:300s]]' }), e => {
    assert.equal(e.kind, 'transient');
    return true;
  });
  assert.equal(groq.stats.calls, q0, 'Groq was never called while fallback is disabled');
});
