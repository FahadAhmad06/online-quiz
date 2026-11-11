import test from 'node:test';
import assert from 'node:assert/strict';
import buildRun from '../src/utils/buildRun.js';
import newAttemptFields from '../src/utils/newAttemptFields.js';
import validateQuestions from '../src/utils/validateQuestions.js';

function withFixedShuffle(fn) {
  const originalRandom = Math.random;
  Math.random = () => 0.01;
  try { fn(); }
  finally { Math.random = originalRandom; }
}

test('truefalse question validates and builds with two options', () => {
  const questions = [{ type: 'truefalse', text: 'Water boils at 100°C.', options: ['True', 'False'], correct: 0 }];
  assert.equal(validateQuestions(questions), null);
  const run = buildRun(questions, false);
  assert.equal(run[0].type, 'truefalse');
  assert.deepEqual(run[0].options, ['True', 'False']);
  assert.equal(run[0].correct, 0);
});

test('question shuffle off + option shuffle off keeps order and option order intact', () => {
  const questions = [
    { type: 'mcq', text: 'Q1', options: ['A', 'B', 'C'], correct: 1 },
    { type: 'truefalse', text: 'Q2', options: ['True', 'False'], correct: 0 },
    { type: 'subjective', text: 'Q3', instructions: 'Answer in 100 words', maxMarks: 5 }
  ];
  const run = buildRun(questions, { shuffleQuestions: false, shuffleOptions: false });
  assert.deepEqual(run.map(q => q.text), ['Q1', 'Q2', 'Q3']);
  assert.deepEqual(run[0].options, ['A', 'B', 'C']);
  assert.deepEqual(run[1].options, ['True', 'False']);
  assert.equal(run[0].correct, 1);
});

test('question shuffle on + option shuffle off randomizes question order but preserves option order', () => {
  const questions = [
    { type: 'mcq', text: 'Q1', options: ['A', 'B', 'C'], correct: 1 },
    { type: 'truefalse', text: 'Q2', options: ['True', 'False'], correct: 0 },
    { type: 'subjective', text: 'Q3', instructions: 'Answer in 100 words', maxMarks: 5 }
  ];
  withFixedShuffle(() => {
    const run = buildRun(questions, { shuffleQuestions: true, shuffleOptions: false });
    assert.notDeepEqual(run.map(q => q.text), ['Q1', 'Q2', 'Q3']);
    const mcq = run.find(q => q.text === 'Q1');
    assert.deepEqual(mcq.options, ['A', 'B', 'C']);
    assert.equal(mcq.correct, 1);
    const tf = run.find(q => q.text === 'Q2');
    assert.deepEqual(tf.options, ['True', 'False']);
    assert.equal(tf.correct, 0);
  });
});

test('question shuffle off + option shuffle on keeps question order but shuffles mcq options only', () => {
  const questions = [
    { type: 'mcq', text: 'Q1', options: ['A', 'B', 'C'], correct: 1 },
    { type: 'truefalse', text: 'Q2', options: ['True', 'False'], correct: 0 },
    { type: 'subjective', text: 'Q3', instructions: 'Answer in 100 words', maxMarks: 5 }
  ];
  withFixedShuffle(() => {
    const run = buildRun(questions, { shuffleQuestions: false, shuffleOptions: true });
    assert.deepEqual(run.map(q => q.text), ['Q1', 'Q2', 'Q3']);
    assert.notDeepEqual(run[0].options, ['A', 'B', 'C']);
    assert.equal(run[0].correct, run[0].options.indexOf('B'));
    assert.deepEqual(run[1].options, ['True', 'False']);
    assert.equal(run[1].correct, 0);
  });
});

test('question shuffle on + option shuffle on randomizes both questions and mcq options', () => {
  const questions = [
    { type: 'mcq', text: 'Q1', options: ['A', 'B', 'C'], correct: 1 },
    { type: 'mcq', text: 'Q2', options: ['A', 'B', 'C'], correct: 0 },
    { type: 'truefalse', text: 'Q3', options: ['True', 'False'], correct: 1 }
  ];
  withFixedShuffle(() => {
    const run = buildRun(questions, { shuffleQuestions: true, shuffleOptions: true });
    assert.notDeepEqual(run.map(q => q.text), ['Q1', 'Q2', 'Q3']);
    const q1 = run.find(q => q.text === 'Q1');
    const q2 = run.find(q => q.text === 'Q2');
    assert.notDeepEqual(q1.options, ['A', 'B', 'C']);
    assert.notDeepEqual(q2.options, ['A', 'B', 'C']);
    assert.equal(q1.correct, q1.options.indexOf('B'));
    assert.equal(q2.correct, q2.options.indexOf('A'));
    const q3 = run.find(q => q.text === 'Q3');
    assert.deepEqual(q3.options, ['True', 'False']);
    assert.equal(q3.correct, 1);
  });
});

test('legacy single shuffle flag still behaves like both shuffles enabled', () => {
  const questions = [
    { type: 'mcq', text: 'Q1', options: ['A', 'B'], correct: 0 },
    { type: 'truefalse', text: 'Q2', options: ['True', 'False'], correct: 1 }
  ];
  withFixedShuffle(() => {
    const run = buildRun(questions, true);
    assert.notDeepEqual(run.map(q => q.text), ['Q1', 'Q2']);
    assert.notDeepEqual(run.find(q => q.text === 'Q1').options, ['A', 'B']);
    assert.deepEqual(run.find(q => q.text === 'Q2').options, ['True', 'False']);
  });
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
