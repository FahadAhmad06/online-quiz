// What the student receives: questions and options only, never the correct answers.
// serverNow lets the client correct for a skewed device clock; the server stays the timing authority.
export default function attemptPayload(attempt, paper) {
  const a = attempt.toObject ? attempt.toObject() : attempt;
  return {
    attemptId: a._id, perQ: paper.perQ, preview: a.preview,
    idx: a.idx, answers: a.answers, qEnd: a.qEnd, serverNow: Date.now(),
    run: a.run.map(({ text, options }) => ({ text, options }))
  };
}
