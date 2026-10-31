// Pure, derived from the same `subjective[]` array the result page already gets from
// GET /attempts/:id/result - no separate counters to keep in sync, nothing stored.
//
// Each question counts exactly once: unanswered first (no non-blank text submitted), then - only
// once its evaluation is 'approved' - by its final mark versus the question's own maxMarks,
// otherwise as pending evaluation. AI-suggested marks are never read before 'approved', so a
// suggestion can never be mistaken for a final mark; a failed evaluation counts as pending (it is
// unresolved, not a 0) since the admin can still grade it manually.
export default function subjectiveStats(subjective = []) {
  const total = subjective.length;
  let unanswered = 0, correct = 0, partial = 0, wrong = 0, pending = 0;
  for (const s of subjective) {
    if (!(s.answer || '').trim()) { unanswered++; continue; }
    if (s.status !== 'approved') { pending++; continue; }
    if (s.marks > 0 && s.marks === s.maxMarks) correct++;
    else if (s.marks > 0) partial++;
    else wrong++;
  }
  return { total, answered: total - unanswered, unanswered, correct, partial, wrong, pending };
}
