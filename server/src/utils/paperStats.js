export default function paperStats(rows) {
  const n = rows.length;
  if (!n) return { count: 0, average: 0, averagePercent: 0, highest: 0, total: 0 };
  return {
    count: n, total: rows[0].total,
    average: Math.round(rows.reduce((s, x) => s + x.correct, 0) / n * 10) / 10,
    averagePercent: Math.round(rows.reduce((s, x) => s + x.percent, 0) / n),
    highest: Math.max(...rows.map(x => x.correct))
  };
}
