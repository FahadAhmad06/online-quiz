import { Router } from 'express';
import Attempt from '../models/Attempt.js';
import Paper from '../models/Paper.js';
import Result from '../models/Result.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import { queueAttemptEvaluations, processPending, finalizeIfReady, limiter } from '../services/subjectiveEvaluation.js';
import { summary } from '../services/evalMetrics.js';
import { clearQuotaBlock, providerSnapshot } from '../services/aiEvaluator.js';
import { ownerFilter } from '../utils/adminFilter.js';
import { waitUntil } from '@vercel/functions';

const r = Router(); // mounted behind requireAdmin
const STATUSES = ['pending', 'evaluating', 'awaiting_review', 'approved', 'manual_review', 'failed'];
const PAGE = 20;

const findEval = (a, idx) => a.evaluations.find(e => e.idx === Number(idx));
// claimToken is internal run bookkeeping, not something the UI needs.
const publicEval = e => { if (!e) return e; const { claimToken, ...rest } = e; return rest; };

// Helper: get the paper codes for this admin, or null for super-admin.
async function adminPaperCodes(req) {
  if (req.admin.isSuper) return null;
  const papers = await Paper.find(ownerFilter(req)).select('code').lean();
  return papers.map(p => p.code);
}

// Build a Mongoose filter that restricts attempts to this admin's papers.
async function attemptScopeFilter(req) {
  const codes = await adminPaperCodes(req);
  if (codes === null) return {};
  return { paperCode: { $in: codes } };
}

// Find an attempt by ID and verify it belongs to one of this admin's papers.
// Returns a plain object (lean) - use for read-only routes.
async function findOwnedAttemptLean(attemptId, req) {
  const a = await Attempt.findById(attemptId).lean();
  if (!a) throw httpError(404, 'Submission not found.');
  const codes = await adminPaperCodes(req);
  if (codes !== null && !codes.includes(a.paperCode)) {
    throw httpError(403, 'You do not have permission to access this submission.');
  }
  return a;
}

// Find an attempt by ID and verify it belongs to one of this admin's papers.
// Returns a Mongoose document - use for mutation routes that call .save().
async function findOwnedAttempt(attemptId, req) {
  const a = await Attempt.findById(attemptId);
  if (!a) throw httpError(404, 'Submission not found.');
  const codes = await adminPaperCodes(req);
  if (codes !== null && !codes.includes(a.paperCode)) {
    throw httpError(403, 'You do not have permission to access this submission.');
  }
  return a;
}

// One row per subjective question still awaiting something, so "Awaiting admin review" means
// exactly what an admin needs to act on next, not a vaguer per-submission status.
r.get('/subjective/stats', asyncHandler(async (req, res) => {
  const scopeFilter = await attemptScopeFilter(req);
  const counts = await Attempt.aggregate([
    { $match: { ...scopeFilter, 'evaluations.0': { $exists: true } } },
    { $unwind: '$evaluations' },
    { $group: { _id: '$evaluations.status', n: { $sum: 1 } } }
  ]);
  const by = Object.fromEntries(counts.map(c => [c._id, c.n]));
  res.json(Object.fromEntries(STATUSES.map(s => [s, by[s] || 0])));
}));

// Per-attempt submission list. "status" filters to attempts with at least one question in that
// state; "progress" is how many of the attempt's subjective questions are already approved.
r.get('/subjective/submissions', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const scopeFilter = await attemptScopeFilter(req);
  const match = { ...scopeFilter, 'evaluations.0': { $exists: true } };
  if (req.query.paper) {
    const code = String(req.query.paper).trim().toUpperCase();
    const codes = await adminPaperCodes(req);
    if (codes !== null && !codes.includes(code)) throw httpError(403, 'You do not have permission to view submissions for this paper.');
    match.paperCode = code;
  }
  if (req.query.status && STATUSES.includes(req.query.status)) match['evaluations.status'] = req.query.status;
  if (req.query.q) {
    const re = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: re }, { roll: re }];
  }
  if (req.query.from || req.query.to) {
    match.createdAt = {};
    if (req.query.from) match.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) match.createdAt.$lte = new Date(req.query.to);
  }
  const [items, total] = await Promise.all([
    Attempt.find(match).select('paperCode paperTitle name roll createdAt evaluations.status needsGrading')
      .sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    Attempt.countDocuments(match)
  ]);
  res.json({
    page, pages: Math.max(1, Math.ceil(total / PAGE)), total,
    items: items.map(a => ({
      attemptId: a._id, paperCode: a.paperCode, paperTitle: a.paperTitle, name: a.name, roll: a.roll, submittedAt: a.createdAt,
      questionCount: a.evaluations.length, approved: a.evaluations.filter(e => e.status === 'approved').length,
      manualReview: a.evaluations.some(e => e.status === 'manual_review'),
      failed: a.evaluations.some(e => e.status === 'failed'),
      aiActive: a.evaluations.filter(e => e.status === 'pending' || e.status === 'evaluating').length,
      aiEvaluating: a.evaluations.some(e => e.status === 'evaluating'),
      pending: a.needsGrading
    }))
  });
}));

r.get('/subjective/submissions/:attemptId', asyncHandler(async (req, res) => {
  const a = await findOwnedAttemptLean(req.params.attemptId, req);
  if (!a.evaluations.length) throw httpError(404, 'Submission not found.');
  res.json({
    attemptId: a._id, paperCode: a.paperCode, paperTitle: a.paperTitle, name: a.name, roll: a.roll, submittedAt: a.createdAt, finalized: !a.needsGrading,
    questions: a.evaluations.map(e => ({
      idx: e.idx, question: a.run[e.idx].text, instructions: a.run[e.idx].instructions, maxMarks: a.run[e.idx].maxMarks,
      rubric: a.run[e.idx].rubric, keyConcepts: a.run[e.idx].keyConcepts, modelAnswer: a.run[e.idx].modelAnswer,
      answer: a.subjectiveText[e.idx] || '', evaluation: publicEval(e)
    }))
  });
}));

async function act(req, res, fn) {
  const { attemptId, idx } = req.params;
  const a = await findOwnedAttempt(attemptId, req);
  const ev = findEval(a, idx);
  if (!ev) throw httpError(404, 'Question not found on this submission.');
  await fn(a, ev);
  await a.save();
  await finalizeIfReady(attemptId);
  const fresh = await Attempt.findById(attemptId).lean();
  res.json({ ok: true, evaluation: publicEval(findEval(fresh, idx)) });
}

// Approve the AI's suggestion as-is, or with admin edits to marks/feedback - one action either way.
r.post('/subjective/submissions/:attemptId/:idx/approve', asyncHandler(async (req, res) => {
  await act(req, res, async (a, ev) => {
    if (ev.status === 'approved') throw httpError(409, 'This question has already been approved.');
    const marks = req.body?.marks === undefined ? ev.suggestedMarks : Number(req.body.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > ev.maxMarks) throw httpError(400, 'Marks must be between 0 and ' + ev.maxMarks + '.');
    const feedback = req.body?.feedback === undefined ? ev.feedback : String(req.body.feedback).slice(0, 4000);
    ev.history.push({ at: new Date(), action: 'approve', suggestedMarks: ev.suggestedMarks, finalMarks: marks, feedback, by: req.admin.email });
    ev.claimToken = null; // a run still in flight must not overwrite an admin decision
    ev.status = 'approved'; ev.finalMarks = marks; ev.finalFeedback = feedback; ev.reviewedBy = req.admin.email; ev.reviewedAt = new Date();
  });
}));

r.post('/subjective/submissions/:attemptId/:idx/manual-review', asyncHandler(async (req, res) => {
  await act(req, res, async (a, ev) => {
    if (ev.status === 'approved') throw httpError(409, 'This question has already been approved; re-evaluate it instead.');
    ev.history.push({ at: new Date(), action: 'manual_review', reason: req.body?.reason || '', by: req.admin.email });
    ev.claimToken = null;
    ev.status = 'manual_review'; ev.needsManualReview = true; ev.failReason = String(req.body?.reason || '').slice(0, 500);
  });
}));

// Explicit, admin-initiated only - never triggered automatically - so an approved mark is never
// silently touched by a background retry.
r.post('/subjective/submissions/:attemptId/:idx/re-evaluate', asyncHandler(async (req, res) => {
  const { attemptId, idx } = req.params;
  const a = await findOwnedAttempt(attemptId, req);
  const ev = findEval(a, idx);
  if (!ev) throw httpError(404, 'Question not found on this submission.');
  ev.history.push({
    at: new Date(), action: 're-evaluate', by: req.admin.email,
    previous: { status: ev.status, suggestedMarks: ev.suggestedMarks, finalMarks: ev.finalMarks, feedback: ev.feedback }
  });
  ev.status = 'pending'; ev.suggestedMarks = null; ev.finalMarks = null; ev.finalFeedback = '';
  ev.reviewedBy = null; ev.reviewedAt = null; ev.failReason = ''; ev.retryCount = 0; ev.needsManualReview = false;
  ev.claimToken = null; ev.failKind = null; ev.retryAfter = null; // supersedes any run still in flight - its late result is discarded
  a.needsGrading = true; // in case approving it had already finalized the attempt's Result
  await a.save();
  clearQuotaBlock(); // an explicit admin request always gets a real attempt
  const grading = queueAttemptEvaluations(attemptId)
    .catch(e => console.error('[eval] re-evaluation queue failed:', e.message));
  waitUntil(grading);
  res.json({ ok: true, status: 'pending' });
}));

// Manual "retry now" sweep for anything stuck pending/evaluating - also what a serverless
// deployment should call on a schedule, since fire-and-forget after a response can die there.
// Removes the submission (the attempt with its answers and grading) and any Result already
// created from it. A grading run still in flight finds nothing to write and is discarded.
r.delete('/subjective/submissions/:attemptId', asyncHandler(async (req, res) => {
  // Verify ownership before deleting.
  await findOwnedAttempt(req.params.attemptId, req);
  const d = await Attempt.deleteOne({ _id: req.params.attemptId, 'evaluations.0': { $exists: true } });
  if (!d.deletedCount) throw httpError(404, 'Submission not found.');
  await Result.deleteMany({ attempt: req.params.attemptId });
  res.json({ ok: true });
}));

// Grading performance for this server process (timings, counts, token usage, and each AI
// provider's current availability) - no answers, names, prompts, or raw provider errors.
r.get('/subjective/metrics', (req, res) => res.json({ ...summary(limiter), providers: providerSnapshot() }));

r.post('/subjective/process-pending', asyncHandler(async (req, res) => {
  const processed = await processPending(Number(req.body?.limit) || 20);
  res.json({ ok: true, processed });
}));

export default r;
