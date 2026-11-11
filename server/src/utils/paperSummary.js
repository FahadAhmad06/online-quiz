import isOpen from './isOpen.js';
// 'scheduled' (startsAt is in the future), 'expired', or 'active' (joinable right now).
function paperStatus(p) {
  if (p.startsAt && Date.now() < new Date(p.startsAt).getTime()) return 'scheduled';
  if (!isOpen(p)) return 'expired';
  return 'active';
}
// Objective questions are worth 1 mark each (MCQ and True/False); subjective questions carry their
// own maxMarks. Kept here, not recomputed per caller, so every paper listing agrees on the total.
function totalMarks(questions) {
  return questions.reduce((s, q) => s + (q.type === 'subjective' ? (q.maxMarks || 0) : 1), 0);
}

export default function paperSummary(p, submissions = 0) {
  return {
    _id: p._id, code: p.code, title: p.title, perQ: p.perQ, timingMode: p.timingMode || 'perQuestion',
    customDuration: p.customDuration || 0,
    shuffleQuestions: !!(p.shuffleQuestions ?? p.shuffle ?? false),
    shuffleOptions: !!(p.shuffleOptions ?? false),
    shuffle: !!(p.shuffleQuestions ?? p.shuffle ?? false) || !!(p.shuffleOptions ?? false),
    startsAt: p.startsAt, expiresAt: p.expiresAt,
    createdAt: p.createdAt, questionCount: p.questions.length, totalMarks: totalMarks(p.questions), submissions,
    open: isOpen(p), status: paperStatus(p)
  };
}
