import { Router } from 'express';
import Paper from '../models/Paper.js';
import Attempt from '../models/Attempt.js';
import Result from '../models/Result.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import isOpen from '../utils/isOpen.js';
import validEmail from '../utils/validEmail.js';
import buildRun from '../utils/buildRun.js';
import attemptPayload from '../utils/attemptPayload.js';

const r = Router();

// Find a paper by code (case-insensitive); 404 if missing, 410 if the link expired.
async function openPaper(code) {
  const p = await Paper.findOne({ code: String(code).trim().toUpperCase() }).lean();
  if (!p) throw httpError(404, 'Paper not found');
  if (!isOpen(p)) throw httpError(410, 'This link has expired');
  return p;
}

r.get('/papers/:code', asyncHandler(async (req, res) => {
  const p = await openPaper(req.params.code);
  res.json({ code: p.code, title: p.title, perQ: p.perQ, count: p.questions.length, expiresAt: p.expiresAt });
}));

r.post('/papers/:code/start', asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const roll = String(req.body?.roll || '').trim().slice(0, 50);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!name || !roll) throw httpError(400, 'Enter your name and roll number.');
  if (!validEmail(email)) throw httpError(400, 'Enter a valid email address.');
  const p = await openPaper(req.params.code);
  const attempt = await Attempt.create({
    paperCode: p.code, paperTitle: p.title, name, roll, email, run: buildRun(p.questions, p.shuffle)
  });
  res.json(attemptPayload(attempt, p));
}));

r.post('/attempts/:id/submit', asyncHandler(async (req, res) => {
  // Atomic: an attempt can be submitted only once.
  const a = await Attempt.findOneAndUpdate({ _id: req.params.id, submitted: false }, { submitted: true }).lean();
  if (!a) throw httpError(409, 'This test was already submitted or does not exist.');
  const given = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const answers = a.run.map((q, i) => Number.isInteger(given[i]) && given[i] >= 0 && given[i] < q.options.length ? given[i] : -1);
  const correct = a.run.filter((q, i) => answers[i] === q.correct).length;
  if (!a.preview) {
    await Result.create({ paperCode: a.paperCode, paperTitle: a.paperTitle, name: a.name, roll: a.roll, email: a.email, correct, total: a.run.length });
  }
  res.json({ ok: correct, total: a.run.length, answers, run: a.run, name: a.name, preview: a.preview });
}));

export default r;
