// Whole-test duration of a paper (perQ seconds x question count), as text.
export default function duration(p) {
  if (!p.perQ) return 'No limit';
  const s = p.perQ * (p.questionCount ?? p.count);
  if (s < 60) return s + ' sec';
  const m = Math.round(s / 60);
  return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + ' min';
}
