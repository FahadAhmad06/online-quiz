import { randomUUID } from 'node:crypto';
import Attempt from '../models/Attempt.js';
import Result from '../models/Result.js';
import Paper from '../models/Paper.js';
import config from '../config.js';
import evaluateAnswer from './aiEvaluator.js';
import createLimiter from '../utils/limiter.js';
import { recordRun, recordBatch } from './evalMetrics.js';


// One limiter for the whole process: answers of one submission grade in parallel, but concurrent
// submissions from many students still never exceed EVAL_CONCURRENCY AI calls at once.
export const limiter = createLimiter(config.evalConcurrency);

// A claim older than this belongs to a run that died (process restart, serverless freeze). It is
// the longest a live run can take: both providers hitting the timeout on every attempt, plus the
// honored in-run backoff waits, assuming 2 providers even if only one is currently configured.
const perProviderWorstMs = config.aiTimeoutMs * config.aiMaxAttemptsPerProvider + 65000 * (config.aiMaxAttemptsPerProvider - 1);
export const LEASE_MS = perProviderWorstMs * 2 + 60000;

// Failures stored before failKind existed: these messages were transient ("it will be retried").
const LEGACY_TRANSIENT = /rate limit|temporary problem|timed out/i;

const set = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => ['evaluations.$[e].' + k, v]));

// Atomically claims one question slot (status in `from` -> evaluating) with a fresh token, so two
// overlapping triggers (submit, sweep, retry) can never double-grade it. The result is written
// only if that same token still holds the claim - a re-evaluation or admin decision in the
// meantime clears it, so an older, slower run can never overwrite a newer state.
async function evaluateIndex(attemptId, idx, queueWaitMs) {
  const t0 = performance.now();
  const token = randomUUID();
  const a = await Attempt.findOneAndUpdate(
    { _id: attemptId, evaluations: { $elemMatch: { idx, status: 'pending' } } },
    { $set: set({ status: 'evaluating', claimToken: token, claimedAt: new Date(), failReason: '' }) },
    { arrayFilters: [{ 'e.idx': idx }], new: true, projection: { run: 1, subjectiveText: 1 } }
  ).lean();
  const dbReadMs = performance.now() - t0;
  if (!a) return false;

  const q = a.run[idx];
  let out = null, err = null;
  try {
    out = await evaluateAnswer({
      question: q.text, instructions: q.instructions, maxMarks: q.maxMarks,
      rubric: q.rubric, keyConcepts: q.keyConcepts, modelAnswer: q.modelAnswer,
      answer: a.subjectiveText[idx]
    });
  } catch (e) { err = e; }
  const meta = (out || err).meta || {};

  const w0 = performance.now();
  const timing = {
    claimToken: null, completedAt: new Date(), durationMs: Math.round(w0 - t0), aiMs: Math.round(meta.aiMs || 0), aiCalls: meta.calls || 0,
    provider: meta.provider || null, model: meta.model || null, fallbackUsed: !!meta.fallbackUsed, providersAttempted: meta.providersAttempted || []
  };
  const update = out
    ? { $set: set({ ...timing, ...out.result, status: out.result.needsManualReview ? 'manual_review' : 'awaiting_review', failKind: null, retryAfter: null, usage: out.usage }) }
    : { $set: set({ ...timing, status: 'failed', failReason: String(err.message || err).slice(0, 500), failKind: err.kind || 'permanent', retryAfter: err.retryAfter || null }),
        // A provider's quota being exhausted says nothing about this answer - it will grade fine
        // once the quota resets, so it doesn't count as a failed run. Any other failure (a bad
        // response, an ordinary 5xx/timeout, a bad key) does count, same as before providers could
        // fall back to each other - otherwise a persistently bad answer/provider pairing would
        // retry forever instead of stopping at EVAL_MAX_RUNS.
        ...(err.quotaOnly ? {} : { $inc: { 'evaluations.$[e].retryCount': 1 } }) };
  const w = await Attempt.updateOne(
    { _id: attemptId, evaluations: { $elemMatch: { idx, status: 'evaluating', claimToken: token } } },
    update, { arrayFilters: [{ 'e.idx': idx }] }
  );
  const dbWriteMs = performance.now() - w0;

  const outcome = !w.matchedCount ? 'superseded' : out ? 'evaluated' : 'failed';
  recordRun({ outcome, queueWaitMs, dbReadMs, dbWriteMs, totalMs: performance.now() - t0, aiMs: meta.aiMs, callMs: meta.callMs,
    calls: meta.calls, rateLimited: meta.rateLimited, timeouts: meta.timeouts, usage: out?.usage, failKind: err?.kind,
    provider: meta.provider, fallbackUsed: meta.fallbackUsed });
  if (outcome === 'failed') console.warn('[eval] attempt ' + attemptId + ' q' + idx + ' failed (' + err.kind + '): ' + err.message);
  return true;
}

// Grades every 'pending' answer on an attempt, in parallel up to the shared limit. Each answer is
// claimed and persisted on its own, so one failure never discards the others. Called fire-and-
// forget after submit / retry; safe to call repeatedly - already-claimed answers are skipped.
export async function queueAttemptEvaluations(attemptId) {
  const t0 = performance.now();
  const a = await Attempt.findById(attemptId).select('evaluations.idx evaluations.status').lean();
  if (!a) return;
  const todo = a.evaluations.filter(e => e.status === 'pending').map(e => e.idx);
  const ran = await Promise.allSettled(todo.map(idx => limiter.run(wait => evaluateIndex(attemptId, idx, wait))));
  const graded = ran.filter(r => r.status === 'fulfilled' && r.value).length;
  if (graded) recordBatch({ answers: graded, wallMs: performance.now() - t0 });
}

// Puts one failed answer back to 'pending' and starts grading it. `transientOnly` limits it to
// failures worth retrying automatically and under EVAL_MAX_RUNS (the student-facing retry).
export async function retryFailed(attemptId, idx, { transientOnly, by }) {
  const cond = { idx, status: 'failed', ...(transientOnly ? { failKind: 'transient', retryCount: { $lt: config.evalMaxRuns }, $nor: [{ retryAfter: { $gt: new Date() } }] } : {}) };
  const r = await Attempt.updateOne(
    { _id: attemptId, evaluations: { $elemMatch: cond } },
    { $set: set({ status: 'pending', claimToken: null }), $push: { 'evaluations.$[e].history': { at: new Date(), action: 'retry', by } } },
    { arrayFilters: [{ 'e.idx': idx }] }
  );
  if (!r.modifiedCount) return false;
  queueAttemptEvaluations(String(attemptId)).catch(() => {});
  return true;
}

// Catch-up sweep, safe to call repeatedly / on a timer: grades anything still 'pending' (e.g. the
// fire-and-forget never ran on a serverless host), reclaims 'evaluating' entries whose lease
// expired (the run died before writing - they go back to pending, never to a result), and retries
// transient failures under EVAL_MAX_RUNS. Never touches awaiting_review/approved/manual_review,
// and never steals a claim that is still within its lease.
export async function processPending(limit = 20) {
  const cutoff = new Date(Date.now() - LEASE_MS);
  const stale = { status: 'evaluating', $or: [{ claimedAt: { $lt: cutoff } }, { claimedAt: null }] };
  const retryable = { status: 'failed', retryCount: { $lt: config.evalMaxRuns }, $or: [{ failKind: 'transient' }, { failKind: null, failReason: LEGACY_TRANSIENT }],
    $nor: [{ retryAfter: { $gt: new Date() } }] };
  const found = await Attempt.find({ needsGrading: true, preview: false, evaluations: { $elemMatch: { $or: [{ status: 'pending' }, stale, retryable] } } })
    .select('_id evaluations.idx evaluations.status evaluations.claimToken evaluations.claimedAt evaluations.failKind evaluations.failReason evaluations.retryCount evaluations.retryAfter')
    .limit(limit).lean();
  let processed = 0;
  await Promise.all(found.map(async a => {
    for (const e of a.evaluations) {
      const isStale = e.status === 'evaluating' && (!e.claimedAt || e.claimedAt < cutoff);
      const transient = e.failKind === 'transient' || (!e.failKind && LEGACY_TRANSIENT.test(e.failReason || ''));
      const isRetry = e.status === 'failed' && transient && e.retryCount < config.evalMaxRuns && !(e.retryAfter > new Date());
      if (!isStale && !isRetry) continue;
      // Conditional on what we just read, so a claim made in between is left alone.
      const cond = isStale ? { idx: e.idx, status: 'evaluating', claimToken: e.claimToken ?? null } : { idx: e.idx, status: 'failed', retryCount: e.retryCount };
      await Attempt.updateOne({ _id: a._id, evaluations: { $elemMatch: cond } },
        { $set: set({ status: 'pending', claimToken: null }) }, { arrayFilters: [{ 'e.idx': e.idx }] });
    }
    processed += a.evaluations.length;
    await queueAttemptEvaluations(String(a._id));
  }));
  return processed;
}

// Called after every admin approval. If every subjective question on the attempt is now approved,
// combine with the MCQ score and create the Result - the only place that happens, so it can never
// occur before every mark on the attempt is final.
export async function finalizeIfReady(attemptId) {
  const a = await Attempt.findById(attemptId).lean();
  if (!a || !a.needsGrading || !a.evaluations.length) return null;
  if (a.evaluations.some(e => e.status !== 'approved')) return null;
  const mcqCorrect = a.run.reduce((s, q, i) => (q.type !== 'subjective' && a.answers[i] === q.correct) ? s + 1 : s, 0);
  const mcqTotal = a.run.length - a.evaluations.length;
  const correct = mcqCorrect + a.evaluations.reduce((s, e) => s + (e.finalMarks || 0), 0);
  const total = mcqTotal + a.evaluations.reduce((s, e) => s + (e.maxMarks || 0), 0);
  // Atomic claim: only the request that actually flips needsGrading true->false writes the
  // Result, so two concurrent "last approval" requests can't race each other. Upserted by
  // `attempt` (not just paperCode+roll) so a later re-evaluation updates the same Result in
  // place instead of creating a duplicate - and a genuine retake's separate attempt still gets
  // its own row.
  const claimed = await Attempt.findOneAndUpdate({ _id: attemptId, needsGrading: true }, { needsGrading: false });
  if (!claimed) return null;
  if (!a.preview) {
    // Look up the paper's adminId so the Result is stamped with ownership information.
    const paper = await Paper.findOne({ code: a.paperCode }).select('adminId').lean();
    const adminId = paper?.adminId || null;
    await Result.findOneAndUpdate(
      { attempt: attemptId },
      { paperCode: a.paperCode, paperTitle: a.paperTitle, name: a.name, roll: a.roll, email: a.email, correct, total, attempt: attemptId, adminId },
      { upsert: true }
    );
  }
  return { correct, total };
}
