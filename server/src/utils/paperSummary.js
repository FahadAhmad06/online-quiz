import isOpen from './isOpen.js';
// 'scheduled' (startsAt is in the future), 'expired', or 'active' (joinable right now).
function paperStatus(p) {
  if (p.startsAt && Date.now() < new Date(p.startsAt).getTime()) return 'scheduled';
  if (!isOpen(p)) return 'expired';
  return 'active';
}
export default function paperSummary(p, submissions = 0) {
  return {
    _id: p._id, code: p.code, title: p.title, perQ: p.perQ, shuffle: p.shuffle,
    startsAt: p.startsAt, expiresAt: p.expiresAt,
    createdAt: p.createdAt, questionCount: p.questions.length, submissions,
    open: isOpen(p), status: paperStatus(p)
  };
}
