// Unit tests for the subjective-answer statistics shown on the student result page.   node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import subjectiveStats from '../src/utils/subjectiveStats.js';

const unanswered = (maxMarks = 5) => ({ answer: '', maxMarks, status: 'pending' });
const pending = (maxMarks = 5, status = 'pending') => ({ answer: 'my answer', maxMarks, status });
const approved = (marks, maxMarks = 5) => ({ answer: 'my answer', maxMarks, status: 'approved', marks });

test('no subjective questions: every count is zero', () => {
  assert.deepEqual(subjectiveStats([]), { total: 0, answered: 0, unanswered: 0, correct: 0, partial: 0, wrong: 0, pending: 0 });
});

test('all unanswered', () => {
  const s = subjectiveStats([unanswered(), unanswered(), unanswered()]);
  assert.deepEqual(s, { total: 3, answered: 0, unanswered: 3, correct: 0, partial: 0, wrong: 0, pending: 0 });
});

test('all answered but awaiting evaluation (various in-flight statuses count as pending)', () => {
  const s = subjectiveStats([pending(5, 'pending'), pending(5, 'evaluating'), pending(5, 'awaiting_review'), pending(5, 'manual_review')]);
  assert.deepEqual(s, { total: 4, answered: 4, unanswered: 0, correct: 0, partial: 0, wrong: 0, pending: 4 });
});

test('a failed evaluation counts as pending, never as wrong (the admin can still grade it)', () => {
  const s = subjectiveStats([pending(5, 'failed')]);
  assert.equal(s.pending, 1);
  assert.equal(s.wrong, 0);
});

test('fully correct, partially correct, and zero-mark answers are classified by final mark', () => {
  const s = subjectiveStats([approved(5, 5), approved(3, 5), approved(0, 5)]);
  assert.deepEqual(s, { total: 3, answered: 3, unanswered: 0, correct: 1, partial: 1, wrong: 1, pending: 0 });
});

test('a mix of answered, unanswered, pending, and every final grade in one attempt', () => {
  const s = subjectiveStats([unanswered(10), pending(10), approved(10, 10), approved(4, 10), approved(0, 10)]);
  assert.deepEqual(s, { total: 5, answered: 4, unanswered: 1, correct: 1, partial: 1, wrong: 1, pending: 1 });
});

test('AI-suggested marks are never read before admin approval, even if present on the record', () => {
  // A non-approved record might still carry a stray `marks`/suggestedMarks-like field from an
  // earlier shape; status must gate it, not the mere presence of a number.
  const s = subjectiveStats([{ answer: 'x', maxMarks: 10, status: 'awaiting_review', marks: 10 }]);
  assert.equal(s.pending, 1);
  assert.equal(s.correct, 0);
});

test('different maxMarks per question are each judged against their own maximum', () => {
  const s = subjectiveStats([approved(2, 2), approved(2, 10)]); // full marks on one, partial on the other
  assert.deepEqual(s, { total: 2, answered: 2, unanswered: 0, correct: 1, partial: 1, wrong: 0, pending: 0 });
});

test('a blank (whitespace-only) answer counts as unanswered, matching the server\'s own "no answer" rule', () => {
  const s = subjectiveStats([{ answer: '   ', maxMarks: 5, status: 'pending' }]);
  assert.equal(s.unanswered, 1);
  assert.equal(s.pending, 0);
});

test('admin changing an already-approved mark (re-evaluation) is reflected by the new record, not accumulated', () => {
  const before = subjectiveStats([approved(0, 10)]);
  assert.equal(before.wrong, 1);
  const after = subjectiveStats([approved(7, 10)]); // same question, updated record after admin edit
  assert.deepEqual(after, { total: 1, answered: 1, unanswered: 0, correct: 0, partial: 1, wrong: 0, pending: 0 });
});

test('answered + unanswered always add up to total, and every bucket sums to total (no double counting, nothing dropped)', () => {
  const subjective = [unanswered(), pending(), approved(5, 5), approved(2, 5), approved(0, 5), pending(5, 'failed')];
  const s = subjectiveStats(subjective);
  assert.equal(s.answered + s.unanswered, s.total);
  assert.equal(s.correct + s.partial + s.wrong + s.pending + s.unanswered, s.total);
});
