import { Router } from 'express';
import Result from '../models/Result.js';
import Student from '../models/Student.js';
import Paper from '../models/Paper.js';
import RetakeGrant from '../models/RetakeGrant.js';
import normalizeRoll from '../utils/normalizeRoll.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';

const r = Router(); // mounted behind requireAdmin

// One row per student+paper that has at least one submitted result, with current retake status.
r.get('/retakes', asyncHandler(async (req, res) => {
  const match = {};
  if (req.query.roll) match.roll = normalizeRoll(req.query.roll);
  if (req.query.code) match.paperCode = String(req.query.code).trim().toUpperCase();

  const groups = await Result.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: {
        _id: { roll: '$roll', paperCode: '$paperCode' },
        name: { $first: '$name' }, paperTitle: { $first: '$paperTitle' },
        lastCorrect: { $first: '$correct' }, lastTotal: { $first: '$total' },
        lastAt: { $first: '$createdAt' }, attempts: { $sum: 1 }
    } },
    { $sort: { lastAt: -1 } }
  ]);

  const grants = await RetakeGrant.find({ used: false }).select('rollNumber paperCode cancelled').lean();
  const allowed = new Set(grants.filter(g => !g.cancelled).map(g => g.rollNumber + '|' + g.paperCode));
  const cancelled = new Set(grants.filter(g => g.cancelled).map(g => g.rollNumber + '|' + g.paperCode));

  res.json(groups.map(g => ({
    roll: g._id.roll, paperCode: g._id.paperCode, name: g.name, paperTitle: g.paperTitle,
    attempts: g.attempts, lastCorrect: g.lastCorrect, lastTotal: g.lastTotal, lastAt: g.lastAt,
    retakeAllowed: allowed.has(g._id.roll + '|' + g._id.paperCode),
    retakeCancelled: cancelled.has(g._id.roll + '|' + g._id.paperCode)
  })));
}));

// Grant (or re-grant, after a previous grant was consumed/cancelled) a retake for one student on one paper.
r.post('/retakes', asyncHandler(async (req, res) => {
  const rollNumber = normalizeRoll(req.body?.rollNumber);
  const paperCode = String(req.body?.paperCode || '').trim().toUpperCase();
  if (!rollNumber || !paperCode) throw httpError(400, 'Roll number and paper code are required.');

  const student = await Student.findOne({ rollNumber });
  if (!student) throw httpError(404, 'No student account with that roll number.');
  if (!(await Paper.exists({ code: paperCode }))) throw httpError(404, 'No paper with that code.');

  const grant = await RetakeGrant.findOneAndUpdate(
    { student: student._id, paperCode, used: false },
    { student: student._id, rollNumber, paperCode, grantedBy: req.admin.email, used: false, cancelled: false, cancelledAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ ok: true, rollNumber, paperCode, grantedAt: grant.createdAt });
}));

// Cancel a not-yet-started retake permission. Never touches Attempt/Result docs.
r.post('/retakes/cancel', asyncHandler(async (req, res) => {
  const rollNumber = normalizeRoll(req.body?.rollNumber);
  const paperCode = String(req.body?.paperCode || '').trim().toUpperCase();
  if (!rollNumber || !paperCode) throw httpError(400, 'Roll number and paper code are required.');

  const student = await Student.findOne({ rollNumber });
  if (!student) throw httpError(404, 'No student account with that roll number.');

  const grant = await RetakeGrant.findOneAndUpdate(
    { student: student._id, paperCode, used: false, cancelled: false },
    { cancelled: true, cancelledAt: new Date() }
  );
  if (!grant) {
    const started = await RetakeGrant.findOne({ student: student._id, paperCode, used: true }).sort({ usedAt: -1 });
    if (started) throw httpError(409, 'The student has already started this retake; it can no longer be cancelled.');
    throw httpError(404, 'No active retake permission to cancel.');
  }
  res.json({ ok: true, rollNumber, paperCode });
}));

export default r;
