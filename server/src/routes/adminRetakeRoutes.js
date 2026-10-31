import { Router } from 'express';
import Result from '../models/Result.js';
import Student from '../models/Student.js';
import Paper from '../models/Paper.js';
import RetakeGrant from '../models/RetakeGrant.js';
import normalizeRoll from '../utils/normalizeRoll.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import { ownerFilter, adminObjectId } from '../utils/adminFilter.js';

const r = Router(); // mounted behind requireAdmin

// Helper: get the set of paper codes this admin owns. Super-admin: null (no restriction).
async function adminPaperCodes(req) {
  if (req.admin.isSuper) return null;
  const papers = await Paper.find(ownerFilter(req)).select('code').lean();
  return papers.map(p => p.code);
}

// One row per student+paper that has at least one submitted result, with current retake status.
r.get('/retakes', asyncHandler(async (req, res) => {
  const codes = await adminPaperCodes(req);
  const match = {};
  if (codes !== null) match.paperCode = { $in: codes };
  if (req.query.roll) match.roll = normalizeRoll(req.query.roll);
  if (req.query.code) {
    const code = String(req.query.code).trim().toUpperCase();
    if (codes !== null && !codes.includes(code)) throw httpError(403, 'You do not have permission to view retakes for this paper.');
    match.paperCode = code;
  }

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

  const grantFilter = codes !== null ? { paperCode: { $in: codes }, used: false } : { used: false };
  const grants = await RetakeGrant.find(grantFilter).select('rollNumber paperCode cancelled').lean();
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

  // Verify this admin owns the paper they are granting a retake for.
  const paper = await Paper.findOne({ code: paperCode });
  if (!paper) throw httpError(404, 'No paper with that code.');
  const codes = await adminPaperCodes(req);
  if (codes !== null && !codes.includes(paperCode)) {
    throw httpError(403, 'You do not have permission to grant retakes for this paper.');
  }

  const grant = await RetakeGrant.findOneAndUpdate(
    { student: student._id, paperCode, used: false },
    { student: student._id, rollNumber, paperCode, grantedBy: req.admin.email,
      adminId: adminObjectId(req), used: false, cancelled: false, cancelledAt: null },
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

  // Verify this admin owns the paper.
  const codes = await adminPaperCodes(req);
  if (codes !== null && !codes.includes(paperCode)) {
    throw httpError(403, 'You do not have permission to cancel retakes for this paper.');
  }

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
