import shuffle from './shuffle.js';
export default function buildRun(questions, shuf) {
  const run = questions.map(q => {
    if (q.type === 'subjective') {
      return {
        type: 'subjective', text: q.text, maxMarks: q.maxMarks, instructions: q.instructions || '',
        rubric: q.rubric || '', keyConcepts: q.keyConcepts || [], modelAnswer: q.modelAnswer || ''
      };
    }
    let order = q.options.map((_, k) => k);
    if (shuf) order = shuffle(order);
    return { type: 'mcq', text: q.text, options: order.map(k => q.options[k]), correct: order.indexOf(q.correct) };
  });
  return shuf ? shuffle(run) : run;
}
