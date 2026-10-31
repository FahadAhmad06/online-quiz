export default function validateQuestions(qs) {
  if (!Array.isArray(qs) || !qs.length) return 'Add at least one question.';
  if (qs.length > 200) return 'A paper can have at most 200 questions.';
  for (const q of qs) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) return 'Every question needs text.';
    if (q.text.length > 4000) return 'Question text is too long (max 4000 characters).';
    if (q.type === 'subjective') {
      if (!Number.isFinite(q.maxMarks) || q.maxMarks <= 0 || q.maxMarks > 1000) return 'Every subjective question needs maximum marks from 1 to 1000.';
      if (q.instructions && (typeof q.instructions !== 'string' || q.instructions.length > 2000)) return 'Instructions are too long (max 2000 characters).';
      if (q.rubric && (typeof q.rubric !== 'string' || q.rubric.length > 4000)) return 'The marking rubric is too long (max 4000 characters).';
      if (q.modelAnswer && (typeof q.modelAnswer !== 'string' || q.modelAnswer.length > 8000)) return 'The model answer is too long (max 8000 characters).';
      if (q.keyConcepts && (!Array.isArray(q.keyConcepts) || q.keyConcepts.length > 30 || q.keyConcepts.some(k => typeof k !== 'string' || k.length > 200))) return 'Key concepts must be a short list of plain text items.';
      continue;
    }
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return 'Every question needs 2 to 4 options.';
    if (q.options.some(o => typeof o !== 'string' || !o.trim())) return 'Fill in every option.';
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) return 'Pick the correct option for every question.';
  }
  return null;
}
