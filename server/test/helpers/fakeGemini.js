// Mock Gemini Developer API. Replaces globalThis.fetch for generativelanguage.googleapis.com only,
// so the real @google/genai SDK still builds the request, parses the response, and raises ApiError
// exactly as it would against the live API. Nothing leaves the machine.
//
// Behaviour is driven by markers inside the student's answer text:
//   [[FAIL500xN]]   - respond 500 the first N times this exact answer is graded, then succeed
//   [[429xN:Ds]]    - respond 429 with RetryInfo retryDelay "Ds" the first N times, then succeed
//   [[401]]         - always 401 (bad key - permanent)
//   [[BADJSONxN]]   - return non-JSON text the first N times, then succeed
//   [[HANG]]        - never respond until the request is aborted (timeout path)
//   [[SLOW:ms]]     - use this latency instead of the default
//   [[MARKS:n]]     - award n marks (default: 60% of max, floored)
//   [[NOMARK]]      - return suggestedMarks: null (schema-valid JSON, unusable mark)
//   [[MARKSEQ:a,b]] - award a on the first call, b on the second (and later) calls
//   [[G:<marker>]]  - any marker above, but applies only to Gemini (ignored here as [[Q:...]] is)
//   [[Q:<marker>]]  - applies only to Groq; dropped here - see fakeGroq.js
const HOST = 'generativelanguage.googleapis.com';

export function installFakeGemini({ latencyMs = 500 } = {}) {
  // Captured at install time (not module load time) so this chains correctly if installFakeGroq()
  // is installed before or after this one - each fake must fall through to whatever fetch was
  // actually active the moment it was installed, not whatever fetch existed when its module first
  // happened to be imported.
  const realFetch = globalThis.fetch;
  const stats = { calls: 0, inFlight: 0, maxInFlight: 0, byAnswer: new Map(), callLog: [] };
  const seen = new Map(); // answer -> times graded, for the xN markers

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason); }, { once: true });
  });

  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes(HOST)) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const prompt = body.contents?.[0]?.parts?.map(p => p.text).join('\n') || '';
    const raw = (prompt.split('--- STUDENT ANSWER')[1] || '').split('--- END STUDENT ANSWER')[0];
    // A marker can be scoped to one provider with a G:/Q: prefix (e.g. "[[G:429x9:300s]]" fails
    // only Gemini while Groq still sees a plain answer) - this fake only honors its own scope and
    // drops the other provider's, so a fallback test can make the two providers behave differently
    // for the exact same submitted answer. An unscoped marker still applies to both.
    const answer = raw.replace(/\[\[Q:[^\]]*\]\]/g, '').replace(/\[\[G:([^\]]*)\]\]/g, '[[$1]]');
    const maxMarks = Number(/MAXIMUM MARKS: (\d+(?:\.\d+)?)/.exec(prompt)?.[1] || 10);
    const n = (seen.get(answer) || 0) + 1; seen.set(answer, n);
    stats.calls++; stats.byAnswer.set(answer, n);
    stats.inFlight++; stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    const t0 = performance.now();
    try {
      if (answer.includes('[[HANG]]')) { await sleep(10 * 60e3, init.signal); }
      const slow = /\[\[SLOW:(\d+)\]\]/.exec(answer);
      await sleep(slow ? Number(slow[1]) : latencyMs, init.signal);

      if (answer.includes('[[401]]')) return json(401, { error: { code: 401, message: 'API key not valid.', status: 'UNAUTHENTICATED' } });
      const f500 = /\[\[FAIL500x(\d+)\]\]/.exec(answer);
      if (f500 && n <= Number(f500[1])) return json(500, { error: { code: 500, message: 'Internal error', status: 'INTERNAL' } });
      const f429 = /\[\[429x(\d+):(\d+(?:\.\d+)?)s\]\]/.exec(answer);
      if (f429 && n <= Number(f429[1])) {
        return json(429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: f429[2] + 's' }] } });
      }
      const bad = /\[\[BADJSONx(\d+)\]\]/.exec(answer);
      const marksM = /\[\[MARKS:(-?\d+(?:\.\d+)?)\]\]/.exec(answer);
      const seqM = /\[\[MARKSEQ:([\d.,]+)\]\]/.exec(answer); // nth call for this answer gets the nth mark
      const marks = seqM ? Number(seqM[1].split(',')[Math.min(n, seqM[1].split(',').length) - 1])
        : marksM ? Number(marksM[1]) : Math.floor(maxMarks * 0.6);
      const text = bad && n <= Number(bad[1]) ? 'Sure! Here is my grading: marks=5' : JSON.stringify({
        suggestedMarks: answer.includes('[[NOMARK]]') ? null : marks, feedback: 'Mock feedback.', strengths: ['covers basics'], missingConcepts: [],
        mistakes: [], reasoningSummary: 'Mock grading.', needsManualReview: false
      });
      return json(200, {
        candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: Math.ceil(prompt.length / 4), candidatesTokenCount: 80, thoughtsTokenCount: 120, totalTokenCount: Math.ceil(prompt.length / 4) + 200 }
      });
    } finally {
      stats.inFlight--;
      stats.callLog.push({ ms: performance.now() - t0 });
    }
  };
  return { stats, restore: () => { globalThis.fetch = realFetch; } };
}
