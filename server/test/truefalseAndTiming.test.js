import test from 'node:test';
import assert from 'node:assert/strict';
import buildRun from '../src/utils/buildRun.js';
import newAttemptFields from '../src/utils/newAttemptFields.js';
import validateQuestions from '../src/utils/validateQuestions.js';

test('truefalse question validates and builds with two options', () => {
  const questions = [{ type: 'truefalse', text: 'Water boils at 100°C.', options: ['True', 'False'], correct: 0 }];
  assert.equal(validateQuestions(questions), null);
  const run = buildRun(questions, false);
  assert.equal(run[0].type, 'truefalse');
  assert.deepEqual(run[0].options, ['True', 'False']);
  assert.equal(run[0].correct, 0);
});

test('per-question timing multiplies duration by question count', () => {
  const run = Array.from({ length: 20 }, () => ({ type: 'mcq', text: 'Q', options: ['A', 'B'], correct: 0 }));
  const attempt = newAttemptFields({ perQ: 120, timingMode: 'perQuestion', customDuration: 0 }, run);
  assert.ok(attempt.qEnd);
  const diffSec = (attempt.qEnd.getTime() - attempt.startedAt.getTime()) / 1000;
  assert.ok(Math.abs(diffSec - 2400) < 2);
});

test('custom total timing never multiplies by question count', () => {
  const run = Array.from({ length: 20 }, () => ({ type: 'mcq', text: 'Q', options: ['A', 'B'], correct: 0 }));
  const attempt = newAttemptFields({ perQ: 120, timingMode: 'customTotal', customDuration: 1800 }, run);
  assert.ok(attempt.qEnd);
  const diffSec = (attempt.qEnd.getTime() - attempt.startedAt.getTime()) / 1000;
  assert.ok(Math.abs(diffSec - 1800) < 2);
});
