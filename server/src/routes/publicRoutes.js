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
  res.json({ code: p.code, title: p.title, perQ: p.perQ, count: p.questions.length, startsAt: p.startsAt, expiresAt: p.expiresAt });
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

  const run = buildRun(p.questions, p.shuffle);
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
// its existing shape) plus any attempt they started but haven't submitted yet (to resume).
r.get('/me/overview', asyncHandler(async (req, res) => {
  if (!req.student) throw httpError(401, 'Please log in.');
  const results = await Result.find({ roll: req.student.rollNumber }).sort({ createdAt: -1 }).lean();
  const inProgress = await Attempt.find({ student: req.student._id, preview: false, submitted: false })
    .select('paperCode paperTitle startedAt').sort({ startedAt: -1 }).lean();
  const completed = results.length;
  const averagePercent = completed ? Math.round(results.reduce((s, r) => s + r.correct / r.total, 0) / completed * 100) : null;
  res.json({ results, inProgress, completed, averagePercent, latest: results[0] || null });
}));

r.get('/attempts/:id', asyncHandler(async (req, res) => {
  const a = await Attempt.findById(req.params.id);
  if (!a) throw httpError(404, 'Test not found.');
  assertOwns(a, req);
  res.json(attemptPayload(a, { perQ: a.perQ }));
}));

// Strict sequential navigation: a.idx is the only question that can be answered. Everything
// before it is locked (answered or skipped), everything after it is unreachable until Next.
// Requests naming any other index are rejected with the authoritative state so the client resyncs.
const progress = a => ({ idx: a.idx, qEnd: a.qEnd, answers: a.answers, serverNow: Date.now() });
async function openAttempt(req) {
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
// A concurrent request moved the attempt on (or submitted it) between our read and write.
async function conflict(id, res) {
  const cur = await Attempt.findById(id);
  if (!cur || cur.submitted) throw httpError(409, 'This test was already submitted or does not exist.');
  res.status(409).json({ error: 'That question is locked and can no longer be changed.', ...progress(cur) });
}

// Autosave the current question's selection without advancing, so a refresh or closed browser
// keeps it. Atomic on idx: a save racing a Next that already moved on can't touch a locked question.
r.patch('/attempts/:id/answer', asyncHandler(async (req, res) => {
  const a = await openAttempt(req);
  const { idx, answer } = req.body || {};
  if (rejectStale(a, idx, res)) return;
  if (a.qEnd && Date.now() >= a.qEnd.getTime()) throw httpError(400, 'Time is up; submit the test instead.');
  if (!validAnswer(a, answer)) throw httpError(400, 'Invalid option.');
  const saved = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false, idx }, { [`answers.${idx}`]: answer }, { new: true });
  if (!saved) return conflict(a._id, res);
  res.json(progress(saved));
}));

r.patch('/attempts/:id/step', asyncHandler(async (req, res) => {
  const a = await openAttempt(req);
  const { idx, answer } = req.body || {};
  if (rejectStale(a, idx, res)) return;
  if (a.qEnd && Date.now() >= a.qEnd.getTime()) throw httpError(400, 'Time is up; submit the test instead.');
  if (idx >= a.run.length - 1) throw httpError(400, 'This is the last question; submit the test instead.');

  // Shared time pool: qEnd is the whole test's deadline, set once at start and never reset here —
  // answering a question early simply leaves its unused time for the rest of the test.
  // Atomic on idx so a duplicate/out-of-order Next can never advance twice or skip a question.
  const update = { $inc: { idx: 1 } };
  if (validAnswer(a, answer)) update.$set = { [`answers.${idx}`]: answer };
  const moved = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false, idx }, update, { new: true });
  if (!moved) return conflict(a._id, res);
  res.json(progress(moved));
}));

r.post('/attempts/:id/submit', asyncHandler(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, submitted: false });
  if (!a) throw httpError(409, 'This test was already submitted or does not exist.');
  assertOwns(a, req);

  const { answer } = req.body || {};
  // Atomic: an attempt can be submitted only once. The final answer only lands on the question
  // that is still current (idx in the filter), never on one a concurrent Next already locked.
  let claimed = null;
  if (Number.isInteger(answer) && answer >= 0 && answer < a.run[a.idx].options.length && (!a.qEnd || Date.now() < a.qEnd.getTime())) {
    claimed = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false, idx: a.idx }, { submitted: true, [`answers.${a.idx}`]: answer }, { new: true }).lean();
  }
  if (!claimed) claimed = await Attempt.findOneAndUpdate({ _id: a._id, submitted: false }, { submitted: true }, { new: true }).lean();
  if (!claimed) throw httpError(409, 'This test was already submitted or does not exist.');

  const correct = claimed.run.filter((q, i) => claimed.answers[i] === q.correct).length;
  if (!claimed.preview) {
    await Result.create({ paperCode: claimed.paperCode, paperTitle: claimed.paperTitle, name: claimed.name, roll: claimed.roll, email: claimed.email, correct, total: claimed.run.length });
  }
  res.json({ ok: correct, total: claimed.run.length, answers: claimed.answers, run: claimed.run, name: claimed.name, preview: claimed.preview });
}));

export default r;
