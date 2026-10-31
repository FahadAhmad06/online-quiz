import { Router } from 'express';
import Result from '../models/Result.js';
import Paper from '../models/Paper.js';
import Admin from '../models/Admin.js';
import AllowedRollNumber from '../models/AllowedRollNumber.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import rankResults from '../utils/rankResults.js';
import scoreFields from '../utils/scoreFields.js';
import normalizeRoll from '../utils/normalizeRoll.js';
import { ownerFilter } from '../utils/adminFilter.js';
import displayName from '../utils/displayName.js';

const r = Router();

// Helper: get the paper codes this admin owns. Super-admin: null (no restriction).
async function adminPaperCodes(req) {
  if (req.admin.isSuper) return null;
  const papers = await Paper.find(ownerFilter(req)).select('code').lean();
  return papers.map(p => p.code);
}

// Ranks are always computed per paper over all of that paper's results.
r.get('/results', asyncHandler(async (req, res) => {
  const codes = await adminPaperCodes(req);
  const f = {};
  if (codes !== null) f.paperCode = { $in: codes };
  if (req.query.paper) {
    const code = String(req.query.paper).toUpperCase();
    // Verify admin owns this paper before filtering to it.
    if (codes !== null && !codes.includes(code)) throw httpError(403, 'You do not have permission to view results for this paper.');
    f.paperCode = code;
  }
  res.json(rankResults(await Result.find(f).lean()));
}));

// Student Profile data: one student's info, assigned teacher, and complete quiz history. Used by
// both the Owner's global Students page and the Owner's Teacher Profile → Student drill-down.
// A regular admin may only open a student registered under their own roll numbers; the optional
// ?teacherId= is the explicit check for "opened via this teacher's profile" (independent of the
// Owner's normal full access) — it 404s if the roll isn't actually assigned to that teacher.
r.get('/students/:roll', asyncHandler(async (req, res) => {
  const roll = normalizeRoll(req.params.roll);
  const allowed = await AllowedRollNumber.findOne({ rollNumber: roll })
    .populate('registeredStudent', 'name rollNumber createdAt').lean();
  if (!allowed || !allowed.registeredStudent) throw httpError(404, 'Student not found.');

  if (!req.admin.isSuper && String(allowed.adminId) !== req.admin.adminId) {
    throw httpError(403, 'This student is not in your workspace.');
  }
  if (req.query.teacherId && String(allowed.adminId || '') !== String(req.query.teacherId)) {
    throw httpError(404, 'This student is not assigned to that teacher.');
  }

  const teacherDoc = allowed.adminId ? await Admin.findById(allowed.adminId).select('name email').lean() : null;
  const results = await Result.find({ roll }).sort({ createdAt: -1 }).lean();

  res.json({
    name: allowed.registeredStudent.name, roll, email: results[0]?.email || '',
    registeredAt: allowed.registeredStudent.createdAt,
    teacher: teacherDoc ? { id: teacherDoc._id, name: displayName(teacherDoc) } : null,
    results: results.map(scoreFields)
  });
}));

r.delete('/results/:id', asyncHandler(async (req, res) => {
  const result = await Result.findById(req.params.id);
  if (!result) throw httpError(404, 'Result not found');
  // Verify admin owns the paper this result belongs to.
  const codes = await adminPaperCodes(req);
  if (codes !== null && !codes.includes(result.paperCode)) {
    throw httpError(403, 'You do not have permission to delete this result.');
  }
  const d = await Result.deleteOne({ _id: req.params.id });
  if (!d.deletedCount) throw httpError(404, 'Result not found');
  res.json({ ok: true });
}));

export default r;
