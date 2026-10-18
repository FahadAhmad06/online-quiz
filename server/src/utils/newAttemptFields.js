// Shared init for a freshly started attempt (real start or admin preview).
// Shared time pool: the whole test gets one deadline (perQ * question count), set once and never
// reset — finishing a question early leaves its saved time for the rest of the test.
export default function newAttemptFields(paper, run) {
  return {
    perQ: paper.perQ, idx: 0, answers: run.map(() => -1),
    qEnd: paper.perQ ? new Date(Date.now() + paper.perQ * run.length * 1000) : null,
    startedAt: new Date()
  };
}
