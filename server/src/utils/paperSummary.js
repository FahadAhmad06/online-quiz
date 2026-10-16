import isOpen from './isOpen.js';
export default function paperSummary(p, submissions = 0) {
  return {
    _id: p._id, code: p.code, title: p.title, perQ: p.perQ, shuffle: p.shuffle, expiresAt: p.expiresAt,
    createdAt: p.createdAt, questionCount: p.questions.length, submissions, open: isOpen(p)
  };
}
