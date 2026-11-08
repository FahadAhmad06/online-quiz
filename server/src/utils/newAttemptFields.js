// Shared init for a freshly started attempt (real start or admin preview).
// Shared time pool: the whole test gets one deadline, set once and never reset — finishing a
// question early leaves its saved time for the rest of the test.
// fromSchedule: a student's first attempt on a scheduled paper runs from paper.startsAt, so logging
// in or clicking Start late never grants a fresh full countdown. Previews and admin-granted retakes
// still start the clock now.
export default function newAttemptFields(paper, run, { fromSchedule = false } = {}) {
  const now = Date.now(), scheduled = paper.startsAt ? new Date(paper.startsAt).getTime() : null;
  const base = fromSchedule && scheduled && scheduled <= now ? scheduled : now;
  const customDuration = Number(paper.customDuration) || 0;
  const totalSeconds = paper.timingMode === 'customTotal' && customDuration > 0
    ? customDuration
    : (paper.perQ ? paper.perQ * run.length : 0);
  return {
    perQ: Number(paper.perQ) || 0,
    timingMode: paper.timingMode || 'perQuestion',
    customDuration,
    idx: 0, answers: run.map(() => -1), subjectiveText: run.map(() => ''),
    qEnd: totalSeconds ? new Date(base + totalSeconds * 1000) : null,
    startedAt: new Date(now)
  };
}
