import { Router } from 'express';
import bcrypt from 'bcryptjs';
import config from '../config.js';
import Admin from '../models/Admin.js';
import Paper from '../models/Paper.js';
import Result from '../models/Result.js';
import AllowedRollNumber from '../models/AllowedRollNumber.js';
import RetakeGrant from '../models/RetakeGrant.js';
import Attempt from '../models/Attempt.js';
import Student from '../models/Student.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import validEmail from '../utils/validEmail.js';
import rankResults from '../utils/rankResults.js';
import paperSummary from '../utils/paperSummary.js';
import displayName from '../utils/displayName.js';

const r = Router(); // mounted behind requireAdmin + requireOwner — EVERY route here is Owner-only.
const MAX_NAME = 80;

// Helper: resolve an admin by Mongo ID, throw 404 if not found.
async function resolveAdmin(id) {
  const a = await Admin.findById(id).select('email name createdAt').lean();
  if (!a) throw httpError(404, 'Admin not found.');
  return a;
}

// ── Admin account management ──────────────────────────────────────────────────

// Admin accounts with assigned-student / quiz / attempt counts, for the Teachers list and the
// Teachers Summary report (reportRoutes.js imports this so both use the exact same numbers).
// Computed in a fixed number of queries (not one per admin) by aggregating
// Paper/AllowedRollNumber/Result once and merging in memory.
export async function getAdminsWithStats() {
  const admins = await Admin.find().select('email name createdAt isEnabled').sort({ createdAt: 1 }).lean();
  const adminIds = admins.map(a => a._id);
  const [papers, rollCounts] = await Promise.all([
    Paper.find({ adminId: { $in: adminIds } }).select('code adminId').lean(),
    AllowedRollNumber.aggregate([
      { $match: { adminId: { $in: adminIds }, isRegistered: true } },
      { $group: { _id: '$adminId', n: { $sum: 1 } } }
    ])
  ]);
  const codesByAdmin = new Map();
  const quizzesByAdmin = new Map();
  for (const p of papers) {
    const key = String(p.adminId);
    codesByAdmin.set(key, [...(codesByAdmin.get(key) || []), p.code]);
    quizzesByAdmin.set(key, (quizzesByAdmin.get(key) || 0) + 1);
  }
  const allCodes = papers.map(p => p.code);
  const [resultCounts, avgByCode] = allCodes.length ? await Promise.all([
    Result.aggregate([{ $match: { paperCode: { $in: allCodes } } }, { $group: { _id: '$paperCode', n: { $sum: 1 } } }]),
    Result.aggregate([{ $match: { paperCode: { $in: allCodes } } }, { $group: { _id: '$paperCode',
      avg: { $avg: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$correct', '$total'] }, 100] }, 0] } } } }])
  ]) : [[], []];
  const resultCountsByCode = Object.fromEntries(resultCounts.map(c => [c._id, c.n]));
  const avgByCodeMap = Object.fromEntries(avgByCode.map(c => [c._id, c.avg]));
  const studentsByAdmin = Object.fromEntries(rollCounts.map(c => [String(c._id), c.n]));

  return admins.map(a => {
    const key = String(a._id), codes = codesByAdmin.get(key) || [];
    const quizAttempts = codes.reduce((s, c) => s + (resultCountsByCode[c] || 0), 0);
    const weightedAvg = codes.reduce((s, c) => s + (avgByCodeMap[c] || 0) * (resultCountsByCode[c] || 0), 0);
    return {
      // `name` is the raw stored value (edit forms prefill from this, blank if never set).
      // `displayName` is the resolved, always-non-blank one every other caller should render.
      _id: a._id, email: a.email, name: a.name || '', displayName: displayName(a),
      createdAt: a.createdAt, isEnabled: a.isEnabled !== false,
      assignedStudents: studentsByAdmin[key] || 0,
      createdQuizzes: quizzesByAdmin.get(key) || 0,
      quizAttempts,
      averageScore: quizAttempts ? Math.round(weightedAvg / quizAttempts) : null
    };
  });
}

// List all admin accounts (excluding the owner account itself, which has no Admin row).
r.get('/', asyncHandler(async (req, res) => {
  res.json({ owner: config.ownerEmail, admins: await getAdminsWithStats() });
}));

// Create a new admin account. Name is required for every new account (legacy accounts created
// before this field existed are handled by displayName()'s fallback, never by backfilling here).
r.post('/', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  if (!name) throw httpError(400, 'Enter a name for this teacher.');
  if (name.length > MAX_NAME) throw httpError(400, 'Name must be at most ' + MAX_NAME + ' characters.');
  if (!validEmail(email)) throw httpError(400, 'Enter a valid email address.');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  if (email === config.ownerEmail || await Admin.exists({ email })) throw httpError(409, 'That email is already an admin.');
  const a = await Admin.create({ email, name, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ _id: a._id, email: a.email, name: a.name });
}));

// Edit an existing admin's name. Email and password are managed separately (account identity
// and login stay untouched by this).
r.patch('/:id/name', asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw httpError(400, 'Enter a name for this teacher.');
  if (name.length > MAX_NAME) throw httpError(400, 'Name must be at most ' + MAX_NAME + ' characters.');
  const a = await Admin.findByIdAndUpdate(req.params.id, { name }, { new: true }).select('email name');
  if (!a) throw httpError(404, 'Admin not found.');
  res.json({ _id: a._id, email: a.email, name: a.name });
}));

// Delete an admin account. The owner's own account cannot be deleted (no Admin doc for it).
r.delete('/:id', asyncHandler(async (req, res) => {
  const d = await Admin.deleteOne({ _id: req.params.id });
  if (!d.deletedCount) throw httpError(404, 'Admin not found');
  res.json({ ok: true });
}));

// Suspend/restore a teacher account without deleting their quizzes, students or results.
// A disabled admin's existing tokens stop working on their very next request (requireAdmin checks
// isEnabled), and they can no longer log back in (adminAuthRoutes checks it too).
r.post('/:id/enable', asyncHandler(async (req, res) => {
  const a = await Admin.findByIdAndUpdate(req.params.id, { isEnabled: true }, { new: true }).select('email isEnabled');
  if (!a) throw httpError(404, 'Admin not found.');
  res.json({ _id: a._id, email: a.email, isEnabled: a.isEnabled });
}));

r.post('/:id/disable', asyncHandler(async (req, res) => {
  const a = await Admin.findByIdAndUpdate(req.params.id, { isEnabled: false }, { new: true }).select('email isEnabled');
  if (!a) throw httpError(404, 'Admin not found.');
  res.json({ _id: a._id, email: a.email, isEnabled: a.isEnabled });
}));

// ── Per-admin data views (Owner-only drill-down) ───────────────────────────────
// These let the Owner inspect and manage any individual admin's data without
// the admin needing to be logged in. All queries are filtered by adminId so the
// Owner can never accidentally see data belonging to a different admin through
// these routes.

// Summary card for one admin: their paper count, result count, pending retakes, etc.
r.get('/:id/stats', asyncHandler(async (req, res) => {
  const admin = await resolveAdmin(req.params.id);
  const adminId = admin._id;
  const papers = await Paper.find({ adminId }).select('code title createdAt expiresAt startsAt').lean();
  const codes = papers.map(p => p.code);
  const codeFilter = { paperCode: { $in: codes } };
  const [resultCount, pendingRetakes, subjPending, rollCount] = await Promise.all([
    Result.countDocuments(codeFilter),
    RetakeGrant.countDocuments({ ...codeFilter, used: false, cancelled: false }),
    Attempt.countDocuments({ ...codeFilter, needsGrading: true, preview: false }),
    AllowedRollNumber.countDocuments({ adminId })
  ]);
  res.json({
    admin: { _id: admin._id, email: admin.email, name: admin.name || '', displayName: displayName(admin), createdAt: admin.createdAt },
    papers: papers.length,
    results: resultCount,
    pendingRetakes,
    pendingSubjective: subjPending,
    rollNumbers: rollCount
  });
}));

// List all papers (quizzes) belonging to one admin.
r.get('/:id/papers', asyncHandler(async (req, res) => {
  await resolveAdmin(req.params.id);
  const papers = await Paper.find({ adminId: req.params.id }).sort({ createdAt: -1 }).lean();
  const counts = await Result.aggregate([
    { $match: { paperCode: { $in: papers.map(p => p.code) } } },
    { $group: { _id: '$paperCode', n: { $sum: 1 } } }
  ]);
  const by = Object.fromEntries(counts.map(c => [c._id, c.n]));
  res.json(papers.map(p => paperSummary(p, by[p.code] || 0)));
}));

// List all results (submissions) for an admin's quizzes.
r.get('/:id/results', asyncHandler(async (req, res) => {
  await resolveAdmin(req.params.id);
  const papers = await Paper.find({ adminId: req.params.id }).select('code').lean();
  const codes = papers.map(p => p.code);
  const filter = codes.length ? { paperCode: { $in: codes } } : { paperCode: '__none__' };
  if (req.query.paper) filter.paperCode = String(req.query.paper).toUpperCase();
  res.json(rankResults(await Result.find(filter).lean()));
}));

// List all allowed roll numbers for one admin's workspace.
r.get('/:id/rolls', asyncHandler(async (req, res) => {
  await resolveAdmin(req.params.id);
  const rows = await AllowedRollNumber.find({ adminId: req.params.id })
    .select('-pinHash -pinFailCount -pinLockedUntil')
    .populate('registeredStudent', 'name rollNumber')
    .sort({ createdAt: -1 }).lean();
  res.json(rows);
}));

// List all retake grants for one admin's quizzes.
r.get('/:id/retakes', asyncHandler(async (req, res) => {
  await resolveAdmin(req.params.id);
  const papers = await Paper.find({ adminId: req.params.id }).select('code').lean();
  const codes = papers.map(p => p.code);
  const filter = codes.length ? { paperCode: { $in: codes } } : { paperCode: '__none__' };
  const grants = await RetakeGrant.find(filter)
    .select('rollNumber paperCode used cancelled grantedBy createdAt updatedAt').sort({ updatedAt: -1 }).lean();
  res.json(grants);
}));

// Count of pending subjective evaluations for one admin's papers.
r.get('/:id/subjective/stats', asyncHandler(async (req, res) => {
  await resolveAdmin(req.params.id);
  const papers = await Paper.find({ adminId: req.params.id }).select('code').lean();
  const codes = papers.map(p => p.code);
  const STATUSES = ['pending', 'evaluating', 'awaiting_review', 'approved', 'manual_review', 'failed'];
  if (!codes.length) return res.json(Object.fromEntries(STATUSES.map(s => [s, 0])));
  const counts = await Attempt.aggregate([
    { $match: { paperCode: { $in: codes }, 'evaluations.0': { $exists: true } } },
    { $unwind: '$evaluations' },
    { $group: { _id: '$evaluations.status', n: { $sum: 1 } } }
  ]);
  const by = Object.fromEntries(counts.map(c => [c._id, c.n]));
  res.json(Object.fromEntries(STATUSES.map(s => [s, by[s] || 0])));
}));

export default r;
