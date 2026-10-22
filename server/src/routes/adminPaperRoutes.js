import { Router } from 'express';
import Paper from '../models/Paper.js';
import Result from '../models/Result.js';
import Attempt from '../models/Attempt.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import isOpen from '../utils/isOpen.js';
import generateCode from '../utils/generateCode.js';
import validateQuestions from '../utils/validateQuestions.js';
import rankResults from '../utils/rankResults.js';
import paperStats from '../utils/paperStats.js';
import paperSummary from '../utils/paperSummary.js';
import buildRun from '../utils/buildRun.js';
import attemptPayload from '../utils/attemptPayload.js';
import newAttemptFields from '../utils/newAttemptFields.js';

const r = Router(), DAY = 86400000;
const findPaper = async id => { const p = await Paper.findById(id); if (!p) throw httpError(404, 'Paper not found'); return p; };

r.get('/stats', asyncHandler(async (req, res) => {
  const [papers, results] = await Promise.all([Paper.find().select('expiresAt').lean(), Result.find().lean()]);
  const latest = rankResults(results).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  res.json({ papers: papers.length, active: papers.filter(isOpen).length, submissions: results.length, latest });
}));

r.get('/papers', asyncHandler(async (req, res) => {
  const [papers, counts] = await Promise.all([
    Paper.find().sort({ createdAt: -1 }).lean(),
    Result.aggregate([{ $group: { _id: '$paperCode', n: { $sum: 1 } } }])
  ]);
  const by = Object.fromEntries(counts.map(c => [c._id, c.n]));
  res.json(papers.map(p => paperSummary(p, by[p.code] || 0)));
}));

r.post('/papers', asyncHandler(async (req, res) => {
  const b = req.body || {}, title = String(b.title || '').trim();
  const perQ = Number(b.perQ), dur = b.durationMs == null ? null : Number(b.durationMs);
  if (!title || title.length > 120) throw httpError(400, 'Give the paper a title (up to 120 characters).');
  if (!Number.isFinite(perQ) || perQ < 0 || perQ > 3600) throw httpError(400, 'Time per question must be from 0 to 60 minutes.');
  if (dur !== null && (!Number.isFinite(dur) || dur <= 0)) throw httpError(400, 'Enter how long the link stays active.');
  let startsAt = null;
  if (b.startsAt) { startsAt = new Date(b.startsAt); if (isNaN(startsAt)) throw httpError(400, 'Invalid start time.'); }
  const qErr = validateQuestions(b.questions);
  if (qErr) throw httpError(400, qErr);
  const paper = await Paper.create({
    code: await generateCode(), title, perQ: Math.round(perQ), shuffle: b.shuffle !== false,
    startsAt, expiresAt: dur === null ? null : new Date(Date.now() + dur), createdBy: req.admin.email,
    questions: b.questions.map(q => ({ text: q.text.trim(), options: q.options.map(o => o.trim()), correct: q.correct }))
  });
  res.status(201).json(paperSummary(paper.toObject()));
}));

r.get('/papers/:id', asyncHandler(async (req, res) => {
  const p = (await findPaper(req.params.id)).toObject();
  const results = rankResults(await Result.find({ paperCode: p.code }).lean());
  res.json({ paper: { ...paperSummary(p, results.length), questions: p.questions }, results, stats: paperStats(results) });
}));

r.post('/papers/:id/extend', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id), ms = Number(req.body?.ms);
  if (!p.expiresAt) throw httpError(400, 'This link never expires.');
  if (!Number.isFinite(ms) || ms <= 0 || ms > 365 * DAY) throw httpError(400, 'Invalid extension.');
  p.expiresAt = new Date(Math.max(Date.now(), p.expiresAt.getTime()) + ms);
  await p.save(); res.json(paperSummary(p.toObject()));
}));

r.post('/papers/:id/close', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id);
  p.expiresAt = new Date(); await p.save(); res.json(paperSummary(p.toObject()));
}));

r.post('/papers/:id/reopen', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id), ms = Number(req.body?.ms) || DAY;
  if (ms <= 0 || ms > 365 * DAY) throw httpError(400, 'Invalid duration.');
  p.expiresAt = new Date(Date.now() + ms); await p.save(); res.json(paperSummary(p.toObject()));
}));

// Setting/clearing the scheduled start is blocked once a real (non-preview) attempt exists,
// so the deadline a student is already relying on can't be moved out from under them.
r.post('/papers/:id/schedule', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id);
  if (await Attempt.exists({ paperCode: p.code, preview: false })) {
    throw httpError(400, 'Students have already started this paper; its start time can no longer be changed.');
  }
  let startsAt = null;
  if (req.body?.startsAt) { startsAt = new Date(req.body.startsAt); if (isNaN(startsAt)) throw httpError(400, 'Invalid start time.'); }
  p.startsAt = startsAt; await p.save(); res.json(paperSummary(p.toObject()));
}));

r.post('/papers/:id/preview', asyncHandler(async (req, res) => {
  const p = (await findPaper(req.params.id)).toObject();
  const run = buildRun(p.questions, p.shuffle);
  const attempt = await Attempt.create({
    paperCode: p.code, paperTitle: p.title, name: 'Admin', roll: '-', email: req.admin.email, preview: true, run, ...newAttemptFields(p, run)
  });
  res.json(attemptPayload(attempt, p));
}));

r.delete('/papers/:id/results', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id);
  await Result.deleteMany({ paperCode: p.code }); res.json({ ok: true });
}));

r.delete('/papers/:id', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id);
  await Promise.all([Paper.deleteOne({ _id: p._id }), Result.deleteMany({ paperCode: p.code }), Attempt.deleteMany({ paperCode: p.code })]);
  res.json({ ok: true });
}));

export default r;
