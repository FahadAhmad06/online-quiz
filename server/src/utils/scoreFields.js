export default function scoreFields(r) {
  return { ...r, wrong: r.total - r.correct, percent: r.total ? Math.round(r.correct / r.total * 100) : 0 };
}
