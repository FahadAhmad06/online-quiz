import shuffle from './shuffle.js';

export function normalizeShuffleSettings(settings = {}) {
  if (typeof settings === 'boolean') {
    return { shuffleQuestions: settings, shuffleOptions: settings };
  }
  const source = settings || {};
  const hasExplicitQuestionSetting = Object.prototype.hasOwnProperty.call(source, 'shuffleQuestions');
  const hasExplicitOptionSetting = Object.prototype.hasOwnProperty.call(source, 'shuffleOptions');
  if (!hasExplicitQuestionSetting && !hasExplicitOptionSetting && typeof source.shuffle === 'boolean') {
    return { shuffleQuestions: source.shuffle, shuffleOptions: source.shuffle };
  }
  return {
    shuffleQuestions: !!(source.shuffleQuestions ?? false),
    shuffleOptions: !!(source.shuffleOptions ?? false)
  };
}

export default function buildRun(questions, settings = {}) {
  const { shuffleQuestions, shuffleOptions } = normalizeShuffleSettings(settings);
  const normalized = questions.map(q => {
    if (q.type === 'subjective') {
      return {
        type: 'subjective', text: q.text, maxMarks: q.maxMarks, instructions: q.instructions || '',
        rubric: q.rubric || '', keyConcepts: q.keyConcepts || [], modelAnswer: q.modelAnswer || ''
      };
    }

    const options = q.type === 'truefalse' ? (q.options && q.options.length === 2 ? q.options : ['True', 'False']) : (q.options || []);
    const answerIndex = Number.isInteger(q.correct) ? q.correct : 0;
    const shouldShuffleOptions = q.type === 'mcq' && shuffleOptions;
    let order = options.map((_, k) => k);
    if (shouldShuffleOptions) order = shuffle(order);

    return {
      type: q.type === 'truefalse' ? 'truefalse' : 'mcq',
      text: q.text,
      options: order.map(k => options[k]),
      correct: shouldShuffleOptions ? order.indexOf(answerIndex) : answerIndex
    };
  });

  if (!shuffleQuestions) return normalized;

  const orderByType = ['mcq', 'truefalse', 'subjective'];
  const grouped = new Map();
  for (const question of normalized) {
    const key = orderByType.includes(question.type) ? question.type : 'other';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(question);
  }

  const ordered = [];
  for (const type of orderByType) {
    const bucket = grouped.get(type) || [];
    if (bucket.length) ordered.push(...shuffle(bucket));
  }

  if (grouped.has('other')) {
    ordered.push(...shuffle(grouped.get('other')));
  }

  return ordered;
}
