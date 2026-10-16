// What the student receives: questions and options only, never the correct answers.
export default function attemptPayload(attempt, paper) {
  const a = attempt.toObject();
  return { attemptId: a._id, perQ: paper.perQ, preview: a.preview, run: a.run.map(({ text, options }) => ({ text, options })) };
}
