import shuffle from './shuffle.js';
export default function buildRun(questions, shuf) {
  const run = questions.map(q => {
    let order = q.options.map((_, k) => k);
    if (shuf) order = shuffle(order);
    return { text: q.text, options: order.map(k => q.options[k]), correct: order.indexOf(q.correct) };
  });
  return shuf ? shuffle(run) : run;
}
