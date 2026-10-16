import scoreFields from './scoreFields.js';
// Rank is per paper: highest marks = rank 1, ties share a rank.
export default function rankResults(list) {
  const by = {};
  list.forEach(r => (by[r.paperCode] = by[r.paperCode] || []).push(r));
  const rank = new Map();
  Object.values(by).forEach(g => g.forEach(r => rank.set(r, 1 + g.filter(x => x.correct > r.correct).length)));
  return [...list]
    .sort((a, b) => b.correct - a.correct || new Date(a.createdAt) - new Date(b.createdAt))
    .map(r => ({ ...scoreFields(r), rank: rank.get(r) }));
}
