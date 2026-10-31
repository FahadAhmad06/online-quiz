// reportRoutes.js — PDF report generation endpoints for Student, Admin, and Owner.
// All endpoints enforce ownership and role checks. PDFs are streamed directly to the
// response; no temporary files are created on disk.
//
// Mounted at:
//   /api/me/reports/...          (student — behind attachStudent, enforced inside)
//   /api/admin/reports/...       (admin   — behind requireAdmin)
//   /api/admin/admins/:id/reports/... (owner — behind requireAdmin + requireOwner, in adminAdminRoutes)
//
// NEVER include rubric, modelAnswer, keyConcepts, claimToken, or suggestedMarks
// in student-facing PDF output.

import { Router } from 'express';
import Paper from '../models/Paper.js';
import Result from '../models/Result.js';
import Attempt from '../models/Attempt.js';
import Student from '../models/Student.js';
import AllowedRollNumber from '../models/AllowedRollNumber.js';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import rankResults from '../utils/rankResults.js';
import {
  buildStudentSingleReport,
  buildAdminQuizReport,
  buildAdminStudentReport,
  buildAdminAllStudentsReport,
  buildOwnerPlatformReport,
  buildConsolidatedStudentsReport,
  buildTeachersSummaryReport
} from '../utils/pdfReport.js';
import { ownerFilter, isOwner } from '../utils/adminFilter.js';
import { pct, grade } from '../utils/scoreGrade.js';
import { getAdminsWithStats } from './adminAdminRoutes.js';
import displayName from '../utils/displayName.js';

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Stream a PDF buffer to the response. */
function sendPdf(res, buf, filename) {
  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length':      buf.length,
    'Cache-Control':       'no-store'
  });
  res.end(buf);
}

/** Safely parse date query params. */
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** Return all paper codes owned by this admin (or null for super). */
async function ownedCodes(req) {
  if (req.admin.isSuper) return null; // null = all
  const papers = await Paper.find({ adminId: req.admin.adminId }).select('code').lean();
  return papers.map(p => p.code);
}

/** Build result filter for an admin, honoring optional paper/date query params. */
function resultFilter(codes, query) {
  const f = codes ? { paperCode: { $in: codes } } : {};
  if (query?.paper) f.paperCode = String(query.paper).toUpperCase();
  const from = parseDate(query?.from), to = parseDate(query?.to);
  if (from || to) {
    f.createdAt = {};
    if (from) f.createdAt.$gte = from;
    if (to)   { to.setHours(23, 59, 59, 999); f.createdAt.$lte = to; }
  }
  return f;
}

// Max result rows to include in a single PDF (prevents runaway memory usage).
const MAX_ROWS = 2000;

// Narrows an already roll-grouped `students` array (each with a `.results` list) to those whose
// average percentage falls in [minPercent, maxPercent] - the same performance-range filter the
// new consolidated report supports, applied here too so the shared filter bar in AdminReports.jsx
// behaves the same regardless of which report button was clicked.
function filterStudentsByPerformance(students, query) {
  const minP = query?.minPercent != null && query.minPercent !== '' ? Number(query.minPercent) : null;
  const maxP = query?.maxPercent != null && query.maxPercent !== '' ? Number(query.maxPercent) : null;
  if (minP == null && maxP == null) return students;
  return students.filter(st => {
    if (!st.results.length) return false;
    const avg = st.results.reduce((s, r) => s + pct(r.correct, r.total), 0) / st.results.length;
    return avg >= (minP ?? 0) && avg <= (maxP ?? 100);
  });
}

const csvList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

// ── Consolidated students report — shared by the CSV JSON endpoint and the PDF endpoint, for
// both the admin (teacher, forced to their own data) and owner (optional multi-teacher) routers,
// so the PDF and the CSV built from the JSON always show the exact same numbers.
// opts.teacherIds / opts.rolls are only ever honored for a super-admin caller — a regular admin's
// own adminId is always the scope, regardless of what the client sends (never trust client ids).
async function consolidatedStudents(req, opts = {}) {
  const isSuper = req.admin.isSuper;
  const scopeAdminIds = isSuper ? (opts.teacherIds?.length ? opts.teacherIds : null) : [req.admin.adminId];

  // Paper codes in scope.
  let codes = null;
  if (scopeAdminIds) codes = (await Paper.find({ adminId: { $in: scopeAdminIds } }).select('code').lean()).map(p => p.code);
  if (opts.paper) {
    const code = String(opts.paper).toUpperCase();
    if (codes !== null && !codes.includes(code)) throw httpError(403, 'You do not have permission to view this quiz.');
    codes = [code];
  }

  // Registered-student universe in scope (used both to validate an explicit roll selection and to
  // pad in students who have zero attempts, per the "include students with no attempts" requirement).
  const rollQuery = scopeAdminIds ? { adminId: { $in: scopeAdminIds }, isRegistered: true } : { isRegistered: true };
  const universeRolls = (await AllowedRollNumber.find(rollQuery).select('rollNumber adminId').lean());
  const universeRollSet = new Set(universeRolls.map(a => a.rollNumber));

  let rollFilter = opts.rolls?.length ? opts.rolls : null;
  if (rollFilter && scopeAdminIds) {
    const unauthorized = rollFilter.filter(r => !universeRollSet.has(r));
    if (unauthorized.length) throw httpError(403, 'Students not in your workspace: ' + unauthorized.join(', '));
  }

  // Scope is by quiz ownership (`codes`, above) — same as the existing /all-students and
  // /selected-students endpoints. `rollFilter` is only an explicit extra narrowing when the
  // caller selected specific students; it never widens or replaces the codes-based scope.
  const filter = {};
  if (codes !== null) filter.paperCode = codes.length ? { $in: codes } : '__none__';
  if (rollFilter) filter.roll = { $in: rollFilter };
  const from = parseDate(opts.from), to = parseDate(opts.to);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); filter.createdAt.$lte = t; }
  }

  const results = await Result.find(filter).select('name roll email correct total').limit(MAX_ROWS).lean();

  // Teacher name per roll: single-teacher scope already knows it (req.admin's own name); otherwise
  // resolve via AllowedRollNumber.adminId -> Admin doc for every roll actually involved. Always a
  // display name, never the email - this flows straight into the PDF/CSV "Teacher" column.
  const rollsInvolved = rollFilter || [...universeRollSet];
  let teacherNameByRoll = new Map();
  if (isSuper) {
    const adminIdsInvolved = [...new Set(universeRolls.filter(a => rollsInvolved.includes(a.rollNumber) && a.adminId).map(a => String(a.adminId)))];
    const adminDocs = adminIdsInvolved.length ? await Admin.find({ _id: { $in: adminIdsInvolved } }).select('name email').lean() : [];
    const nameByAdminId = Object.fromEntries(adminDocs.map(a => [String(a._id), displayName(a)]));
    for (const a of universeRolls) teacherNameByRoll.set(a.rollNumber, a.adminId ? nameByAdminId[String(a.adminId)] || null : null);
  } else {
    for (const roll of rollsInvolved) teacherNameByRoll.set(roll, displayName(req.admin));
  }

  const byRoll = new Map();
  for (const r of results) {
    if (!byRoll.has(r.roll)) byRoll.set(r.roll, { name: r.name, roll: r.roll, email: r.email || '', totalMarks: 0, obtainedMarks: 0, attempts: 0 });
    const s = byRoll.get(r.roll);
    s.totalMarks += r.total; s.obtainedMarks += r.correct; s.attempts += 1;
  }

  // Pad in students with zero attempts so they still appear in the consolidated report.
  const missingRolls = rollsInvolved.filter(roll => !byRoll.has(roll));
  if (missingRolls.length) {
    const students = await Student.find({ rollNumber: { $in: missingRolls } }).select('name rollNumber').lean();
    for (const s of students) byRoll.set(s.rollNumber, { name: s.name, roll: s.rollNumber, email: '', totalMarks: 0, obtainedMarks: 0, attempts: 0 });
  }

  let rows = [...byRoll.values()].map(s => {
    const percentage = s.attempts ? pct(s.obtainedMarks, s.totalMarks) : null;
    return {
      name: s.name, roll: s.roll, email: s.email, totalMarks: s.totalMarks, obtainedMarks: s.obtainedMarks,
      percentage, grade: percentage != null ? grade(percentage).label : '—',
      teacherName: teacherNameByRoll.get(s.roll) || null
    };
  });

  const minP = opts.minPercent != null ? Number(opts.minPercent) : null;
  const maxP = opts.maxPercent != null ? Number(opts.maxPercent) : null;
  if (minP != null || maxP != null) {
    rows = rows.filter(r => r.percentage != null && r.percentage >= (minP ?? 0) && r.percentage <= (maxP ?? 100));
  }
  rows.sort((a, b) => a.roll.localeCompare(b.roll));
  rows = rows.slice(0, MAX_ROWS);

  const scored = rows.filter(r => r.percentage != null).map(r => r.percentage);
  const summary = {
    totalStudents: rows.length,
    averageMarks: rows.length ? Math.round(rows.reduce((s, r) => s + r.obtainedMarks, 0) / rows.length) : null,
    averagePercentage: scored.length ? Math.round(scored.reduce((s, p) => s + p, 0) / scored.length) : null,
    highestScore: scored.length ? Math.max(...scored) : null,
    lowestScore: scored.length ? Math.min(...scored) : null
  };
  return { rows, summary };
}

function consolidatedOptsFromQuery(query) {
  return {
    teacherIds: csvList(query.teachers), rolls: csvList(query.rolls), paper: query.paper,
    from: query.from, to: query.to, minPercent: query.minPercent, maxPercent: query.maxPercent
  };
}

function teacherLabelFromQuery(query, admin) {
  if (!admin.isSuper) return displayName(admin);
  const ids = csvList(query.teachers);
  return ids.length ? ids.length + ' selected teacher(s)' : 'All Teachers';
}

// ══════════════════════════════════════════════════════════════════════════════
// A. STUDENT REPORTS
// Mounted at /api (public router, behind attachStudent)
// ══════════════════════════════════════════════════════════════════════════════
export const studentReportRouter = Router();

/** List student's own completed results (lightweight JSON for "My Reports" UI). */
studentReportRouter.get('/me/reports', asyncHandler(async (req, res) => {
  if (!req.student) throw httpError(401, 'Please log in.');
  const results = await Result.find({ roll: req.student.rollNumber })
    .sort({ createdAt: -1 }).lean();
  res.json(results.map(r => ({
    _id:        r._id,
    paperTitle: r.paperTitle,
    paperCode:  r.paperCode,
    correct:    r.correct,
    total:      r.total,
    percent:    r.total ? Math.round(r.correct / r.total * 100) : 0,
    createdAt:  r.createdAt,
    attempt:    r.attempt
  })));
}));

/** Download a single result as PDF — student can only download their own. */
studentReportRouter.get('/me/reports/:resultId/pdf', asyncHandler(async (req, res) => {
  if (!req.student) throw httpError(401, 'Please log in.');

  const result = await Result.findById(req.params.resultId).lean();
  if (!result) throw httpError(404, 'Report not found.');

  // Ownership: roll number must match the logged-in student.
  if (result.roll !== req.student.rollNumber) throw httpError(403, 'This is not your report.');

  // Fetch linked attempt (optional — for MCQ/subjective breakdown).
  let attempt = null;
  if (result.attempt) {
    attempt = await Attempt.findById(result.attempt)
      .select('-run.rubric -run.keyConcepts -run.modelAnswer -evaluations.claimToken -evaluations.history')
      .lean();
    // Extra safety: never leak suggestedMarks to students — they only see finalMarks.
    if (attempt?.evaluations) {
      attempt.evaluations = attempt.evaluations.map(e => ({
        idx: e.idx, status: e.status, maxMarks: e.maxMarks,
        finalMarks: e.status === 'approved' ? e.finalMarks : null,
        finalFeedback: e.status === 'approved' ? e.finalFeedback : ''
      }));
    }
  }

  const buf = await buildStudentSingleReport({ result, attempt });
  const safe = (result.paperTitle || result.paperCode).replace(/[^a-z0-9]/gi, '_');
  sendPdf(res, buf, `QuizRoom_Report_${safe}.pdf`);
}));

// ══════════════════════════════════════════════════════════════════════════════
// B. ADMIN REPORTS
// Mounted at /api/admin/reports (behind requireAdmin)
// ══════════════════════════════════════════════════════════════════════════════
export const adminReportRouter = Router();

/** List available filter options (papers owned by admin). */
adminReportRouter.get('/filters', asyncHandler(async (req, res) => {
  const of = ownerFilter(req);
  const papers = await Paper.find(of).select('_id code title createdAt').sort({ createdAt: -1 }).lean();
  res.json({ papers });
}));

/** Single quiz PDF report. */
adminReportRouter.get('/quiz/:paperId', asyncHandler(async (req, res) => {
  const paper = await Paper.findById(req.params.paperId).lean();
  if (!paper) throw httpError(404, 'Quiz not found.');
  if (!isOwner(req, paper)) throw httpError(403, 'You do not own this quiz.');

  const filter = resultFilter(null, req.query);
  filter.paperCode = paper.code; // this quiz only - resultFilter's own `paper` query param doesn't apply here
  const results = rankResults(await Result.find(filter).sort({ createdAt: -1 }).limit(MAX_ROWS).lean());

  const buf = await buildAdminQuizReport({ paper, results, admin: displayName(req.admin), filters: req.query });
  sendPdf(res, buf, `Quiz_Report_${paper.code}.pdf`);
}));

/** Individual student PDF — all results for one student on admin's quizzes. */
adminReportRouter.get('/student/:roll', asyncHandler(async (req, res) => {
  const roll = String(req.params.roll).toUpperCase();

  // Verify student is registered under this admin's roll numbers.
  if (!req.admin.isSuper) {
    const allowed = await AllowedRollNumber.findOne({ rollNumber: roll, adminId: req.admin.adminId });
    if (!allowed) throw httpError(403, 'This student is not in your workspace.');
  }

  const codes = await ownedCodes(req);
  const filter = resultFilter(codes, req.query);
  filter.roll = roll;
  const results = await Result.find(filter).sort({ createdAt: -1 }).limit(MAX_ROWS).lean();

  // Get student name from DB.
  const studentDoc = await Student.findOne({ rollNumber: roll }).select('name rollNumber').lean();
  const student = { name: studentDoc?.name || results[0]?.name || roll, roll, email: studentDoc?.email || '' };

  const buf = await buildAdminStudentReport({ student, results, adminName: displayName(req.admin), filters: req.query });
  sendPdf(res, buf, `Student_Report_${roll}.pdf`);
}));

/** All students bulk report — combined PDF. */
adminReportRouter.get('/all-students', asyncHandler(async (req, res) => {
  const codes = await ownedCodes(req);
  const filter = resultFilter(codes, req.query);
  const results = await Result.find(filter).sort({ roll: 1, createdAt: -1 }).limit(MAX_ROWS).lean();

  // Group by roll number.
  const byRoll = {};
  for (const r of results) {
    if (!byRoll[r.roll]) byRoll[r.roll] = { name: r.name, roll: r.roll, results: [] };
    byRoll[r.roll].results.push(r);
  }
  const students = filterStudentsByPerformance(Object.values(byRoll).sort((a, b) => a.roll.localeCompare(b.roll)), req.query);

  if (!students.length) throw httpError(404, 'No results found for the given filters.');

  const buf = await buildAdminAllStudentsReport({ students, adminName: displayName(req.admin), filters: req.query });
  sendPdf(res, buf, `All_Students_Report.pdf`);
}));

/** Selected students — accepts comma-separated roll numbers or JSON body. */
adminReportRouter.get('/selected-students', asyncHandler(async (req, res) => {
  const rollsParam = String(req.query.rolls || '');
  const rolls = rollsParam.split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
  if (!rolls.length) throw httpError(400, 'Provide roll numbers in the rolls query param.');
  if (rolls.length > 200) throw httpError(400, 'Select at most 200 students per report.');

  // Enforce ownership: each roll must belong to this admin.
  if (!req.admin.isSuper) {
    const allowed = await AllowedRollNumber.find({ rollNumber: { $in: rolls }, adminId: req.admin.adminId }).lean();
    const allowedSet = new Set(allowed.map(a => a.rollNumber));
    const unauthorized = rolls.filter(r => !allowedSet.has(r));
    if (unauthorized.length) throw httpError(403, 'Students not in your workspace: ' + unauthorized.join(', '));
  }

  const codes = await ownedCodes(req);
  const filter = resultFilter(codes, req.query);
  filter.roll = { $in: rolls };
  const results = await Result.find(filter).sort({ roll: 1, createdAt: -1 }).limit(MAX_ROWS).lean();

  const byRoll = {};
  for (const r of results) {
    if (!byRoll[r.roll]) byRoll[r.roll] = { name: r.name, roll: r.roll, results: [] };
    byRoll[r.roll].results.push(r);
  }
  const students = filterStudentsByPerformance(Object.values(byRoll).sort((a, b) => a.roll.localeCompare(b.roll)), req.query);

  if (!students.length) throw httpError(404, 'No results found for the selected students.');

  const buf = await buildAdminAllStudentsReport({ students, adminName: displayName(req.admin), filters: req.query });
  sendPdf(res, buf, `Selected_Students_Report.pdf`);
}));

/** Consolidated student summary (JSON) — one row per student, same dataset the CSV button and the
 * PDF below both read from. For a regular admin this is always scoped to their own students. */
adminReportRouter.get('/students-consolidated', asyncHandler(async (req, res) => {
  const data = await consolidatedStudents(req, consolidatedOptsFromQuery(req.query));
  res.json(data);
}));

adminReportRouter.get('/students-consolidated/pdf', asyncHandler(async (req, res) => {
  const { rows, summary } = await consolidatedStudents(req, consolidatedOptsFromQuery(req.query));
  if (!rows.length) throw httpError(404, 'No students found for the given filters.');
  const buf = await buildConsolidatedStudentsReport({
    rows, summary,
    filters: { ...req.query, teacherLabel: teacherLabelFromQuery(req.query, req.admin) }
  });
  sendPdf(res, buf, 'Consolidated_Students_Report.pdf');
}));

// ══════════════════════════════════════════════════════════════════════════════
// C. OWNER-ONLY REPORTS
// These are added to adminAdminRoutes (already behind requireOwner).
// We export a separate router for them to keep this file self-contained.
// ══════════════════════════════════════════════════════════════════════════════
export const ownerReportRouter = Router();

/** Platform-wide report: all admins + their results. */
ownerReportRouter.get('/platform', asyncHandler(async (req, res) => {
  // `admin` query param is an internal lookup key (email, unique and already known to the Owner
  // from Settings) - never shown back; the report only ever displays the resolved name.
  const filterEmail = req.query.admin ? String(req.query.admin).trim().toLowerCase() : null;
  const adminFilter = filterEmail ? { email: filterEmail } : {};
  const adminDocs = await Admin.find(adminFilter).select('name email').lean();

  const admins = await Promise.all(adminDocs.map(async a => {
    const filter = resultFilter([null], req.query); // date filter if provided
    delete filter.paperCode; // rebuild properly
    const papers  = await Paper.find({ adminId: a._id }).select('code title createdAt').lean();
    const codes   = papers.map(p => p.code);
    const rFilter = codes.length ? { paperCode: { $in: codes } } : { paperCode: '__none__' };
    if (req.query.from || req.query.to) {
      rFilter.createdAt = {};
      const from = parseDate(req.query.from), to = parseDate(req.query.to);
      if (from) rFilter.createdAt.$gte = from;
      if (to)   { const t = new Date(to); t.setHours(23, 59, 59, 999); rFilter.createdAt.$lte = t; }
    }
    const results = await Result.find(rFilter).sort({ createdAt: -1 }).limit(500).lean();
    return { name: displayName(a), papers, results };
  }));

  const buf = await buildOwnerPlatformReport({ admins, filters: { adminName: admins.length === 1 ? admins[0].name : undefined, ...req.query } });
  sendPdf(res, buf, 'Platform_Report.pdf');
}));

/** One admin's data, requested by Owner. */
ownerReportRouter.get('/admin/:adminId', asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.adminId).select('name email').lean();
  if (!admin) throw httpError(404, 'Admin not found.');
  const papers = await Paper.find({ adminId: req.params.adminId }).select('code title').lean();
  const codes  = papers.map(p => p.code);
  const filter = codes.length ? { paperCode: { $in: codes } } : { paperCode: '__none__' };
  const results = await Result.find(filter).sort({ createdAt: -1 }).limit(MAX_ROWS).lean();
  const students = Object.values(
    results.reduce((acc, r) => {
      if (!acc[r.roll]) acc[r.roll] = { name: r.name, roll: r.roll, results: [] };
      acc[r.roll].results.push(r); return acc;
    }, {})
  ).sort((a, b) => a.roll.localeCompare(b.roll));
  const name = displayName(admin);
  const buf = await buildAdminAllStudentsReport({ students, adminName: name, filters: { teacherScope: name } });
  sendPdf(res, buf, `Teacher_Report_${name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}));

/** One quiz, Owner scope (no ownership restriction — Owner sees all). */
ownerReportRouter.get('/quiz/:paperId', asyncHandler(async (req, res) => {
  const paper = await Paper.findById(req.params.paperId).lean();
  if (!paper) throw httpError(404, 'Quiz not found.');
  const filter = resultFilter(null, req.query);
  filter.paperCode = paper.code;
  const results = rankResults(await Result.find(filter).sort({ createdAt: -1 }).limit(MAX_ROWS).lean());
  const adminDoc = paper.adminId ? await Admin.findById(paper.adminId).select('name email').lean() : null;
  const buf = await buildAdminQuizReport({ paper, results, admin: adminDoc ? displayName(adminDoc) : 'Legacy', filters: req.query });
  sendPdf(res, buf, `Quiz_Report_${paper.code}.pdf`);
}));

/** All Students Consolidated Report (JSON) — Owner scope: no teacher filter = whole platform;
 * `teachers=<id,id>` narrows to those teachers' students; `rolls=<roll,roll>` picks specific students. */
ownerReportRouter.get('/students-consolidated', asyncHandler(async (req, res) => {
  const data = await consolidatedStudents(req, consolidatedOptsFromQuery(req.query));
  res.json(data);
}));

ownerReportRouter.get('/students-consolidated/pdf', asyncHandler(async (req, res) => {
  const { rows, summary } = await consolidatedStudents(req, consolidatedOptsFromQuery(req.query));
  if (!rows.length) throw httpError(404, 'No students found for the given filters.');
  const buf = await buildConsolidatedStudentsReport({
    rows, summary,
    filters: { ...req.query, teacherLabel: teacherLabelFromQuery(req.query, req.admin) }
  });
  sendPdf(res, buf, 'All_Students_Consolidated_Report.pdf');
}));

/** Teachers Summary Report (JSON + PDF) — Owner-only roster of all teachers with their stats.
 * Reuses getAdminsWithStats(), the exact same source as the Teachers list page. */
ownerReportRouter.get('/teachers-summary', asyncHandler(async (req, res) => {
  const ids = csvList(req.query.teachers);
  let teachers = await getAdminsWithStats();
  if (ids.length) { const idSet = new Set(ids); teachers = teachers.filter(t => idSet.has(String(t._id))); }
  res.json({ teachers });
}));

ownerReportRouter.get('/teachers-summary/pdf', asyncHandler(async (req, res) => {
  const ids = csvList(req.query.teachers);
  let teachers = await getAdminsWithStats();
  if (ids.length) { const idSet = new Set(ids); teachers = teachers.filter(t => idSet.has(String(t._id))); }
  if (!teachers.length) throw httpError(404, 'No teachers found for the given filters.');
  const buf = await buildTeachersSummaryReport({ teachers, filters: { teacherLabel: ids.length ? ids.length + ' selected teacher(s)' : 'All Teachers' } });
  sendPdf(res, buf, 'Teachers_Summary_Report.pdf');
}));
