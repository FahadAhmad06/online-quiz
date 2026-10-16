export default function validateQuestions(qs) {
  if (!Array.isArray(qs) || !qs.length) return 'Add at least one question.';
  if (qs.length > 200) return 'A paper can have at most 200 questions.';
  for (const q of qs) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) return 'Every question needs text.';
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return 'Every question needs 2 to 4 options.';
    if (q.options.some(o => typeof o !== 'string' || !o.trim())) return 'Fill in every option.';
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) return 'Pick the correct option for every question.';
  }
  return null;
}
