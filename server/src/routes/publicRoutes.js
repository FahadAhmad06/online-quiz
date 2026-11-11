import { Router } from 'express';
import Paper from '../models/Paper.js';
import Attempt from '../models/Attempt.js';
import Result from '../models/Result.js';
import RetakeGrant from '../models/RetakeGrant.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import isOpen from '../utils/isOpen.js';
import buildRun from '../utils/buildRun.js';
import attemptPayload from '../utils/attemptPayload.js';
import newAttemptFields from '../utils/newAttemptFields.js';
import { queueAttemptEvaluations, retryFailed } from '../services/subjectiveEvaluation.js';
import { waitUntil } from '@vercel/functions';
import config from '../config.js';

const r = Router();

// Find a paper by code (case-insensitive); 404 if missing, 410 if the link expired.
async function openPaper(code) {
  const p = await Paper.findOne({ code: String(code).trim().toUpperCase() }).lean();
  if (!p) throw httpError(404, 'Paper not found');
  if (!isOpen(p)) throw httpError(410, 'This link has expired');
  return p;
}

// An attempt is owned by req.student, except admin-preview attempts which have no student.
function assertOwns(attempt, req) {
  if (attempt.preview) return;
  if (!req.student || !attempt.student || String(attempt.student) !== String(req.student._id)) throw httpError(403, 'This is not your test.');
}

r.get('/papers/:code', asyncHandler(async (req, res) => {
  const p = await openPaper(req.params.code);
  res.json({ code: p.code, title: p.title, perQ: p.perQ, timingMode: p.timingMode || 'perQuestion', customDuration: p.customDuration || 0, count: p.questions.length, startsAt: p.startsAt, expiresAt: p.expiresAt });
}));

r.post('/papers/:code/start', asyncHandler(async (req, res) => {
  if (!req.student) throw httpError(401, 'Please log in to start a test.');
  const p = await openPaper(req.params.code);
  if (p.startsAt && Date.now() < new Date(p.startsAt).getTime()) throw httpError(403, 'This exam has not started yet.');

  const existing = await Attempt.findOne({ paperCode: p.code, student: req.student._id, preview: false }).sort({ attemptNumber: -1 });
  if (existing && !existing.submitted) return res.json(attemptPayload(existing, p)); // resume, unaffected by retakes

  let attemptNumber = 1, grant = null;
  if (existing) {
    // Already submitted once — only continue if the admin granted (and this claims) a retake.
    grant = await RetakeGrant.findOneAndUpdate(
      { student: req.student._id, paperCode: p.code, used: false, cancelled: false },
      { used: true, usedAt: new Date() }
    );
    if (!grant) throw httpError(403, 'You have already submitted this test. Ask your admin to authorize a retake.');
    attemptNumber = existing.attemptNumber + 1;
  }

  const run = buildRun(p.questions, {
    shuffleQuestions: !!(p.shuffleQuestions ?? p.shuffle ?? false),
    shuffleOptions: !!(p.shuffleOptions ?? false)
  });
  // A first attempt on a scheduled paper shares the paper's fixed window (see newAttemptFields).
  const fields = newAttemptFields(p, run, { fromSchedule: attemptNumber === 1 });
  if (fields.qEnd && fields.qEnd.getTime() <= Date.now()) {
    if (grant) await RetakeGrant.updateOne({ _id: grant._id }, { used: false, usedAt: null });
    throw httpError(403, 'The scheduled time for this exam has already ended.');
  }
  let attempt;
  try {
    attempt = await Attempt.create({
      paperCode: p.code, paperTitle: p.title, name: req.student.name, roll: req.student.rollNumber,
      student: req.student._id, run, attemptNumber, ...fields
    });
  } catch (e) {
    if (grant) await RetakeGrant.updateOne({ _id: grant._id }, { used: false, usedAt: null }); // roll back the claim
    throw e;
  }
  if (grant) await RetakeGrant.updateOne({ _id: grant._id }, { attempt: attempt._id });
  res.json(attemptPayload(attempt, p));
}));

// A student's own history: their past results (by roll - Result has no student ref, matching
// its existing shape), any attempt they started but haven't submitted yet (to resume), and any
// submitted attempt still awaiting subjective grading (no Result exists for those yet).

r.post('/attempts/:id/violation', asyncHandler(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, submitted: false });
  if (!a) throw httpError(404, 'Attempt not found.');
  assertOwns(a, req);
  if (a.examStatus === 'suspended') throw httpError(403, 'This examination is suspended. A teacher or owner must approve resume before continuing.');
  if (a.qEnd && Date.now() >= a.qEnd.getTime()) throw httpError(409, 'This exam deadline has already expired.');

  const history = a.violationHistory || [];
  const last = history[history.length - 1];
  if (last && last.source === 'tab_switch' && Date.now() - new Date(last.at).getTime() < 2000) {
    return res.json({ ok: true, tabSwitchCount: a.tabSwitchCount || 0, examStatus: a.examStatus || 'in_progress', suspensionReason: a.suspensionReason || null });
  }

  const count = (a.tabSwitchCount || 0) + 1;
  const base = {
    tabSwitchCount: count,
    violationHistory: [...history, { at: new Date(), count, reason: count >= 3 ? 'Tab switch limit reached' : 'Tab switch violation', source: 'tab_switch' }]
  };

  if (count >= 3) {
    Object.assign(base, {
      examStatus: 'suspended',
      suspendedAt: new Date(),
      suspensionReason: 'Your examination has been suspended because you exceeded the allowed tab-switch limit. Please contact your teacher or administrator.'
    });
  }

  const saved = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false }, base, { new: true });
  res.json({ ok: true, tabSwitchCount: saved.tabSwitchCount || 0, examStatus: saved.examStatus || 'in_progress', suspensionReason: saved.suspensionReason || null, alert: count >= 3 ? 'suspended' : count === 2 ? 'final_warning' : 'warning' });
}));

r.get('/me/overview', asyncHandler(async (req, res) => {
  if (!req.student) throw httpError(401, 'Please log in.');
  const now = new Date();
  await Attempt.deleteMany({
    student: req.student._id,
    preview: false,
    submitted: false,
    qEnd: { $ne: null, $lte: now }
  });
  const results = await Result.find({ roll: req.student.rollNumber }).sort({ createdAt: -1 }).lean();
  const inProgress = await Attempt.find({ student: req.student._id, preview: false, submitted: false })
    .select('paperCode paperTitle startedAt').sort({ startedAt: -1 }).lean();
  const pendingReview = await Attempt.find({ student: req.student._id, preview: false, submitted: true, needsGrading: true })
    .select('_id paperCode paperTitle createdAt').sort({ createdAt: -1 }).lean();
  const completed = results.length;
  const averagePercent = completed ? Math.round(results.reduce((s, r) => s + r.correct / r.total, 0) / completed * 100) : null;
  res.json({ results, inProgress, pendingReview, completed, averagePercent, latest: results[0] || null });
}));

r.get('/attempts/:id', asyncHandler(async (req, res) => {
  const now = new Date();
  const expired = await Attempt.findOne({ _id: req.params.id, submitted: false, qEnd: { $ne: null, $lte: now } });
  if (expired) {
    await Attempt.deleteOne({ _id: req.params.id });
    throw httpError(410, 'This exam time has expired and the attempt was removed.');
  }
  const a = await Attempt.findById(req.params.id);
  if (!a) throw httpError(404, 'Test not found.');
  assertOwns(a, req);
  res.json({ ...attemptPayload(a, { perQ: a.perQ }), examStatus: a.examStatus || 'in_progress', tabSwitchCount: a.tabSwitchCount || 0, suspensionReason: a.suspensionReason || null });
}));

// Strict sequential navigation: a.idx is the only question that can be answered. Everything
// before it is locked (answered or skipped), everything after it is unreachable until Next.
// Requests naming any other index are rejected with the authoritative state so the client resyncs.
const progress = a => ({ idx: a.idx, qEnd: a.qEnd, startedAt: a.startedAt, answers: a.answers, subjectiveText: a.subjectiveText || [], serverNow: Date.now(), examStatus: a.examStatus || 'in_progress', tabSwitchCount: a.tabSwitchCount || 0, suspensionReason: a.suspensionReason || null });
async function openAttempt(req) {
  const now = new Date();
  const expired = await Attempt.findOne({ _id: req.params.id, submitted: false, qEnd: { $ne: null, $lte: now } });
  if (expired) {
    await Attempt.deleteOne({ _id: req.params.id });
    throw httpError(410, 'This exam time has expired and the attempt was removed.');
  }
  const a = await Attempt.findOne({ _id: req.params.id, submitted: false });
  if (!a) throw httpError(409, 'This test was already submitted or does not exist.');
  assertOwns(a, req);
  return a;
}
function rejectStale(a, idx, res) {
  if (idx === a.idx) return false;
  res.status(409).json({ error: idx < a.idx ? 'That question is locked and can no longer be changed.' : 'You cannot skip ahead to that question.', ...progress(a) });
  return true;
}
const validAnswer = (a, answer) => Number.isInteger(answer) && answer >= -1 && answer < a.run[a.idx].options.length;
const MAX_SUBJECTIVE_LEN = 20000;
const validSubjectiveAnswer = answer => typeof answer === 'string' && answer.length <= MAX_SUBJECTIVE_LEN;
// A concurrent request moved the attempt on (or submitted it) between our read and write.
async function conflict(id, res) {
  const cur = await Attempt.findById(id);
  if (!cur || cur.submitted) throw httpError(409, 'This test was already submitted or does not exist.');
  res.status(409).json({ error: 'That question is locked and can no longer be changed.', ...progress(cur) });
}

// Autosave a question's selection without advancing, so a refresh or closed browser keeps it.
// MCQ stays strictly on the current question only (atomic on idx, same as always). A subjective
// question already reached (idx < a.idx) can still be revised any time before submit - that's
// the one case this doesn't require idx to match the frontier, and since idx only ever advances,
// re-checking it against a concurrently-moved frontier isn't needed for that write to stay valid.
r.patch('/attempts/:id/answer', asyncHandler(async (req, res) => {
  const a = await openAttempt(req);
  if (a.examStatus === 'suspended') throw httpError(403, 'This examination is suspended. Wait for teacher or owner approval before continuing.');
  const { idx, answer } = req.body || {};
  if (!Number.isInteger(idx) || idx < 0 || idx >= a.run.length) throw httpError(400, 'Invalid question.');
  const subjective = a.run[idx].type === 'subjective';
  const revising = subjective && idx < a.idx;
  if (!revising && rejectStale(a, idx, res)) return;
  if (a.qEnd && Date.now() >= a.qEnd.getTime()) throw httpError(400, 'Time is up; submit the test instead.');
  if (subjective ? !validSubjectiveAnswer(answer) : !validAnswer(a, answer)) throw httpError(400, 'Invalid answer.');
  const update = subjective ? { [`subjectiveText.${idx}`]: answer } : { [`answers.${idx}`]: answer };
  const filter = revising ? { _id: a._id, submitted: false } : { _id: a._id, submitted: false, idx };
  const saved = await Attempt.findOneAndUpdate(filter, update, { new: true });
  if (!saved) return conflict(a._id, res);
  res.json(progress(saved));
}));

r.patch('/attempts/:id/step', asyncHandler(async (req, res) => {
  const a = await openAttempt(req);
  if (a.examStatus === 'suspended') throw httpError(403, 'This examination is suspended. Wait for teacher or owner approval before continuing.');
  const { idx, answer } = req.body || {};
  if (rejectStale(a, idx, res)) return;
  if (a.qEnd && Date.now() >= a.qEnd.getTime()) throw httpError(400, 'Time is up; submit the test instead.');
  if (idx >= a.run.length - 1) throw httpError(400, 'This is the last question; submit the test instead.');

  // Shared time pool: qEnd is the whole test's deadline, set once at start and never reset here —
  // answering a question early simply leaves its unused time for the rest of the test.
  // Atomic on idx so a duplicate/out-of-order Next can never advance twice or skip a question.
  const subjective = a.run[idx].type === 'subjective';
  const update = { $inc: { idx: 1 } };
  if (subjective ? validSubjectiveAnswer(answer) : validAnswer(a, answer)) {
    update.$set = subjective ? { [`subjectiveText.${idx}`]: answer } : { [`answers.${idx}`]: answer };
  }
  const moved = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false, idx }, update, { new: true });
  if (!moved) return conflict(a._id, res);
  res.json(progress(moved));
}));

r.post('/attempts/:id/submit', asyncHandler(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, submitted: false });
  if (!a) throw httpError(409, 'This test was already submitted or does not exist.');
  assertOwns(a, req);
  if (a.examStatus === 'suspended') throw httpError(403, 'This examination is suspended. A teacher or owner must approve resume before you can submit.');

  const { answer } = req.body || {};
  const current = a.run[a.idx], inTime = !a.qEnd || Date.now() < a.qEnd.getTime();
  // Atomic: an attempt can be submitted only once. The final answer only lands on the question
  // that is still current (idx in the filter), never on one a concurrent Next already locked.
  let finalUpdate = null;
  if (inTime && current.type === 'subjective' && validSubjectiveAnswer(answer)) finalUpdate = { [`subjectiveText.${a.idx}`]: answer };
  else if (inTime && current.type !== 'subjective' && Number.isInteger(answer) && answer >= 0 && answer < current.options.length) finalUpdate = { [`answers.${a.idx}`]: answer };

  let claimed = finalUpdate && await Attempt.findOneAndUpdate({ _id: a._id, submitted: false, idx: a.idx }, { submitted: true, ...finalUpdate }, { new: true }).lean();
  if (!claimed) claimed = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false }, { submitted: true }, { new: true }).lean();
  if (!claimed) throw httpError(409, 'This test was already submitted or does not exist.');

  const subjIdx = claimed.run.reduce((arr, q, i) => { if (q.type === 'subjective') arr.push(i); return arr; }, []);
  const mcqCorrect = claimed.run.reduce((s, q, i) => (q.type !== 'subjective' && claimed.answers[i] === q.correct) ? s + 1 : s, 0);
  const mcqTotal = claimed.run.length - subjIdx.length;

  if (!subjIdx.length) {
    // Unchanged path: a pure-MCQ paper is scored and recorded immediately, exactly as before.
    if (!claimed.preview) {
      // Look up the paper's adminId for ownership tracking on the Result.
      const paper = await Paper.findOne({ code: claimed.paperCode }).select('adminId').lean();
      await Result.create({ paperCode: claimed.paperCode, paperTitle: claimed.paperTitle, name: claimed.name, roll: claimed.roll, email: claimed.email, correct: mcqCorrect, total: mcqTotal, attempt: claimed._id, adminId: paper?.adminId || null });
    }
    return res.json({ ok: mcqCorrect, total: mcqTotal, answers: claimed.answers, run: claimed.run, name: claimed.name, preview: claimed.preview });
  }

  // Has subjective questions: no Result yet - the final mark waits for admin-approved grading.
  // Preview attempts use the same evaluation lifecycle so local preview testing cannot leave
  // pending subjective records stranded outside the worker.
  const evaluations = subjIdx.map(idx => ({ idx, status: 'pending', maxMarks: claimed.run[idx].maxMarks }));
  await Attempt.updateOne({ _id: claimed._id }, { needsGrading: true, evaluations });
  const grading = queueAttemptEvaluations(String(claimed._id))
    .catch(e => console.error('[eval] submission queue failed:', e.message));
  waitUntil(grading);

  res.json({
    pending: true, attemptId: claimed._id, mcqCorrect, mcqTotal, subjectiveCount: subjIdx.length,
    answers: claimed.answers, run: claimed.run, name: claimed.name, preview: claimed.preview
  });
}));

// Only what the question needed and what the student wrote, plus the grading outcome once
// approved. Before approval: no marks, no AI feedback, no rubric — just a status. A failure gets
// a generic message (the stored failReason is admin-facing) and says whether the student may retry.
const AI_DONE = ['awaiting_review', 'manual_review', 'approved'];
function subjectiveStudentView(run, subjectiveText, evaluations) {
  return run.reduce((arr, q, i) => {
    if (q.type !== 'subjective') return arr;
    const e = evaluations.find(x => x.idx === i);
    const status = e?.status || 'pending';
    arr.push({
      idx: i, text: q.text, maxMarks: q.maxMarks, answer: subjectiveText[i] || '', status,
      ...(status === 'approved' ? { marks: e.finalMarks, feedback: e.finalFeedback } : {}),
      ...(status === 'failed' ? {
        error: 'Automatic grading could not be completed for this answer. Your answer is saved; your teacher will review it.',
        retryable: e.failKind === 'transient' && e.retryCount < config.evalMaxRuns && !(e.retryAfter > new Date())
      } : {})
    });
    return arr;
  }, []);
}
const progressOf = subjective => ({
  total: subjective.length,
  evaluated: subjective.filter(s => AI_DONE.includes(s.status)).length,
  approved: subjective.filter(s => s.status === 'approved').length,
  pending: subjective.filter(s => s.status === 'pending').length,
  evaluating: subjective.filter(s => s.status === 'evaluating').length,
  failed: subjective.filter(s => s.status === 'failed').length
});

r.get('/attempts/:id/result', asyncHandler(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, submitted: true }).lean();
  if (!a) throw httpError(404, 'Result not found.');
  assertOwns(a, req);
  const subjIdx = a.run.reduce((arr, q, i) => { if (q.type === 'subjective') arr.push(i); return arr; }, []);
  const mcqCorrect = a.run.reduce((s, q, i) => (q.type !== 'subjective' && a.answers[i] === q.correct) ? s + 1 : s, 0);
  const mcqTotal = a.run.length - subjIdx.length;
  const subjective = subjectiveStudentView(a.run, a.subjectiveText || [], a.evaluations || []);
  const allApproved = subjective.every(s => s.status === 'approved');
  // Read-only by design: polling this never starts or retries an evaluation.
  res.json({
    pending: !allApproved, attemptId: a._id, mcqCorrect, mcqTotal, subjective,
    progress: progressOf(subjective), approvalRequired: subjective.length > 0, serverNow: Date.now(),
    correct: allApproved ? mcqCorrect + subjective.reduce((s, x) => s + x.marks, 0) : null,
    total: allApproved ? mcqTotal + subjective.reduce((s, x) => s + x.maxMarks, 0) : null,
    // mcq entries unstripped (correct answers are revealed after submit, as before); subjective
    // detail lives in `subjective[]` above so the private rubric/model answer never reaches here.
    run: a.run.map(q => q.type === 'subjective' ? { type: 'subjective' } : q), answers: a.answers,
    name: a.name, preview: a.preview
  });
}));

// A student may re-run AI grading of their own answer only after a transient failure, and only
// up to EVAL_MAX_RUNS runs in total; anything else is the admin's call. Never touches an answer
// already graded, being graded, or approved.
r.post('/attempts/:id/subjective/:idx/retry', asyncHandler(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, submitted: true }).select('student preview').lean();
  if (!a) throw httpError(404, 'Result not found.');
  if (a.preview) throw httpError(400, 'Previews are not graded.');
  assertOwns(a, req);
  const ok = await retryFailed(a._id, Number(req.params.idx), { transientOnly: true, by: 'student' });
  if (!ok) throw httpError(409, 'This answer cannot be retried right now. Your teacher will review it.');
  const grading = queueAttemptEvaluations(String(a._id))
    .catch(e => console.error('[eval] student retry queue failed:', e.message));
  waitUntil(grading);
  res.json({ ok: true, status: 'pending' });
}));

export default r;
