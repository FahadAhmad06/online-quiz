// A misconfigured AI_PRIMARY_PROVIDER must fail loudly and do nothing - never silently default to
// a different provider than the one the deployment actually asked for, and never make a network call.
import './helpers/env.js';
process.env.AI_PRIMARY_PROVIDER = 'not-a-real-provider';
process.env.AI_FALLBACK_ENABLED = 'false';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: evaluateAnswer, clearQuotaBlock } = await import('../src/services/aiEvaluator.js');

test('an unknown AI_PRIMARY_PROVIDER is a permanent, visible failure - no calls made', async () => {
  await assert.rejects(() => evaluateAnswer({ question: 'Q', maxMarks: 10, rubric: 'r', answer: 'a' }), e => {
    assert.equal(e.kind, 'permanent');
    assert.match(e.message, /No AI provider is configured/);
    assert.equal(e.meta.calls, 0);
    return true;
  });
  clearQuotaBlock(); // must not throw even with no real providers configured
});
