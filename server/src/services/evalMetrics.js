// In-memory grading metrics for this server process (reset on restart; per-instance on serverless).
// Holds timings and counts only - never answers, names, prompts, or raw provider errors.
const MAX = 500;
const runs = [];    // one entry per grading run of one answer
const batches = []; // one entry per queueAttemptEvaluations() call (a whole submission)
const counters = { evaluated: 0, failed: 0, superseded: 0, retries: 0, rateLimited: 0, timeouts: 0, aiCalls: 0, fallbackTriggered: 0 };
const byProvider = {}; // e.g. { Gemini: { evaluated: 0, failed: 0 }, Groq: { evaluated: 0, failed: 0 } }
const startedAt = new Date();

const push = (arr, x) => { arr.push(x); if (arr.length > MAX) arr.shift(); };

export function recordRun(r) {
  push(runs, { at: Date.now(), ...r });
  counters[r.outcome] = (counters[r.outcome] || 0) + 1;
  counters.retries += Math.max(0, (r.calls || 0) - 1);
  counters.rateLimited += r.rateLimited || 0;
  counters.timeouts += r.timeouts || 0;
  counters.aiCalls += r.calls || 0;
  if (r.fallbackUsed) counters.fallbackTriggered++;
  if (r.provider && (r.outcome === 'evaluated' || r.outcome === 'failed')) {
    const p = byProvider[r.provider] ??= { evaluated: 0, failed: 0 };
    p[r.outcome]++;
  }
}

export function recordBatch(b) { push(batches, { at: Date.now(), ...b }); }

function dist(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0, avg: null, p50: null, p95: null, max: null };
  const pick = p => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { n: v.length, avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length), p50: Math.round(pick(0.5)), p95: Math.round(pick(0.95)), max: Math.round(v[v.length - 1]) };
}

export function summary(limiter) {
  const ok = runs.filter(r => r.outcome === 'evaluated');
  const sum = k => ok.reduce((s, r) => s + (r.usage?.[k] || 0), 0);
  return {
    scope: 'This server process since ' + startedAt.toISOString() + ' (last ' + MAX + ' runs).',
    counters: { ...counters },
    byProvider: { ...byProvider },
    queue: limiter ? { active: limiter.active, waiting: limiter.waiting, concurrency: limiter.max } : null,
    // totalMs: claim -> persisted result. aiMs: inside a provider's calls. callMs: a single AI call.
    totalMs: dist(ok.map(r => r.totalMs)),
    aiMs: dist(ok.map(r => r.aiMs)),
    callMs: dist(runs.flatMap(r => r.callMs || [])),
    queueWaitMs: dist(runs.map(r => r.queueWaitMs)),
    dbReadMs: dist(runs.map(r => r.dbReadMs)),
    dbWriteMs: dist(runs.map(r => r.dbWriteMs)),
    submissionMs: dist(batches.map(b => b.wallMs)),
    avgTokensPerAnswer: ok.length ? {
      prompt: Math.round(sum('prompt') / ok.length), output: Math.round(sum('output') / ok.length),
      thoughts: Math.round(sum('thoughts') / ok.length), total: Math.round(sum('total') / ok.length)
    } : null
  };
}
