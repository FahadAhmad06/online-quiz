// Mock Groq's OpenAI-compatible Chat Completions API. Replaces globalThis.fetch for api.groq.com
// only, so the real groq-sdk still builds the request, parses the response, and raises its real
// error classes exactly as it would against the live API. Nothing leaves the machine.
//
// Same control markers as fakeGemini.js (see its header for the full list), embedded in the
// student's answer text: [[FAIL500xN]] [[429xN:Ds]] [[401]] [[BADJSONxN]] [[HANG]] [[SLOW:ms]]
// [[MARKS:n]] [[NOMARK]] [[MARKSEQ:a,b]] - plus [[G:...]]/[[Q:...]] to scope a marker to only one
// provider. This fake drops [[G:...]] markers and unwraps its own [[Q:...]] ones.
const HOST = 'api.groq.com';

export function installFakeGroq({ latencyMs = 500 } = {}) {
  // Captured at install time, not module load time - see fakeGemini.js for why this matters when
  // both fakes are installed together.
  const realFetch = globalThis.fetch;
  const stats = { calls: 0, inFlight: 0, maxInFlight: 0, byAnswer: new Map(), callLog: [] };
  const seen = new Map(); // answer -> times graded, for the xN markers

  const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason); }, { once: true });
  });

  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes(HOST)) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const prompt = body.messages?.find(m => m.role === 'user')?.content || '';
    const raw = (prompt.split('--- STUDENT ANSWER')[1] || '').split('--- END STUDENT ANSWER')[0];
    // See fakeGemini.js: a G:/Q: scoped marker applies to only one provider; this fake drops
    // Gemini-scoped markers and unwraps its own.
    const answer = raw.replace(/\[\[G:[^\]]*\]\]/g, '').replace(/\[\[Q:([^\]]*)\]\]/g, '[[$1]]');
    const maxMarks = Number(/MAXIMUM MARKS: (\d+(?:\.\d+)?)/.exec(prompt)?.[1] || 10);
    const n = (seen.get(answer) || 0) + 1; seen.set(answer, n);
    stats.calls++; stats.byAnswer.set(answer, n);
    stats.inFlight++; stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    const t0 = performance.now();
    try {
      if (answer.includes('[[HANG]]')) { await sleep(10 * 60e3, init.signal); }
      const slow = /\[\[SLOW:(\d+)\]\]/.exec(answer);
      await sleep(slow ? Number(slow[1]) : latencyMs, init.signal);

      if (answer.includes('[[401]]')) return json(401, { error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } });
      const f500 = /\[\[FAIL500x(\d+)\]\]/.exec(answer);
      if (f500 && n <= Number(f500[1])) return json(500, { error: { message: 'Internal server error', type: 'internal_server_error' } });
      const f429 = /\[\[429x(\d+):(\d+(?:\.\d+)?)s\]\]/.exec(answer);
      if (f429 && n <= Number(f429[1])) return json(429, { error: { message: 'Rate limit reached', type: 'rate_limit_exceeded' } }, { 'retry-after': f429[2] });
      const bad = /\[\[BADJSONx(\d+)\]\]/.exec(answer);
      const marksM = /\[\[MARKS:(-?\d+(?:\.\d+)?)\]\]/.exec(answer);
      const seqM = /\[\[MARKSEQ:([\d.,]+)\]\]/.exec(answer); // nth call for this answer gets the nth mark
      const marks = seqM ? Number(seqM[1].split(',')[Math.min(n, seqM[1].split(',').length) - 1])
        : marksM ? Number(marksM[1]) : Math.floor(maxMarks * 0.6);
      const content = bad && n <= Number(bad[1]) ? 'Sure! Here is my grading: marks=5' : JSON.stringify({
        suggestedMarks: answer.includes('[[NOMARK]]') ? null : marks, feedback: 'Mock feedback.', strengths: ['covers basics'], missingConcepts: [],
        mistakes: [], reasoningSummary: 'Mock grading.', needsManualReview: false
      });
      return json(200, {
        id: 'mock', object: 'chat.completion', created: 0, model: body.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
        usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: 80, total_tokens: Math.ceil(prompt.length / 4) + 80, completion_tokens_details: { reasoning_tokens: 40 } }
      });
    } finally {
      stats.inFlight--;
      stats.callLog.push({ ms: performance.now() - t0 });
    }
  };
  return { stats, restore: () => { globalThis.fetch = realFetch; } };
}
