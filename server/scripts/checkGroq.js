// Live check of AI grading with the real Groq API and this server's configuration (.env).
// Grades three synthetic sample answers (good, partial, wrong) through the same code path as real
// submissions and prints marks, timing and token usage. Makes 3+ Groq calls; touches no database.
// Runs independently of AI_PROVIDER, so it can verify Groq even while Gemini is the active provider.
//   npm run check:groq
import config from '../src/config.js';
import evaluateAnswer from '../src/services/groqEvaluator.js';

const question = {
  question: 'Explain what photosynthesis is and why it is important for life on Earth.',
  maxMarks: 5,
  rubric: '2 marks: plants convert light energy, CO2 and water into glucose. 1 mark: oxygen is released. 1 mark: happens in chloroplasts / chlorophyll. 1 mark: importance (food chain base or oxygen supply).',
  keyConcepts: ['light energy', 'carbon dioxide', 'water', 'glucose', 'oxygen', 'chlorophyll']
};
const samples = [
  ['good', 'Photosynthesis is how green plants use sunlight, captured by chlorophyll in their chloroplasts, to turn carbon dioxide and water into glucose, releasing oxygen. It matters because it supplies the oxygen we breathe and is the base of almost every food chain.'],
  ['partial', 'Plants make their food using sunlight.'],
  ['wrong', 'Photosynthesis is when animals digest food in their stomach to get energy.']
];

console.log('Model: ' + config.groqModel + ' | key configured: ' + (config.groqApiKey ? 'yes' : 'NO') +
  ' | timeout: ' + config.aiTimeoutMs / 1000 + 's');
if (!config.groqApiKey) {
  console.log('GROQ_API_KEY is not set - add it to .env and re-run.');
  process.exit(1);
}
const t0 = performance.now();
const results = await Promise.all(samples.map(async ([label, answer]) => {
  const s = performance.now();
  try {
    const { result, usage, meta } = await evaluateAnswer({ ...question, answer });
    return { answer: label, ok: 'yes', marks: result.suggestedMarks + '/' + question.maxMarks, flagged: result.needsManualReview,
      seconds: ((performance.now() - s) / 1000).toFixed(1), calls: meta.calls, tokens: usage.total, reasoningTokens: usage.thoughts };
  } catch (e) {
    return { answer: label, ok: 'NO', error: e.message, kind: e.kind, seconds: ((performance.now() - s) / 1000).toFixed(1), calls: e.meta?.calls };
  }
}));
console.table(results);
console.log('All 3 graded in parallel in ' + ((performance.now() - t0) / 1000).toFixed(1) + 's');
const ok = results.filter(r => r.ok === 'yes');
if (ok.length === 3) {
  const m = l => Number(results.find(r => r.answer === l).marks.split('/')[0]);
  console.log(m('good') > m('partial') && m('partial') >= m('wrong') ? 'Grading order looks sensible (good > partial >= wrong).' : 'WARNING: marks are not in the expected order - review grading quality.');
}
process.exit(ok.length === 3 ? 0 : 1);
