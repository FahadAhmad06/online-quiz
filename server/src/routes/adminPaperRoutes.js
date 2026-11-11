import { Router } from 'express';
import Paper from '../models/Paper.js';
import Result from '../models/Result.js';
import Attempt from '../models/Attempt.js';
import Student from '../models/Student.js';
import AllowedRollNumber from '../models/AllowedRollNumber.js';
import RetakeGrant from '../models/RetakeGrant.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import isOpen from '../utils/isOpen.js';
import generateCode from '../utils/generateCode.js';
import validateQuestions from '../utils/validateQuestions.js';
import rankResults from '../utils/rankResults.js';
import paperStats from '../utils/paperStats.js';
import paperSummary from '../utils/paperSummary.js';
import buildRun, { normalizeShuffleSettings } from '../utils/buildRun.js';
import attemptPayload from '../utils/attemptPayload.js';
import newAttemptFields from '../utils/newAttemptFields.js';
import { ownerFilter, adminObjectId, isOwner } from '../utils/adminFilter.js';
import Admin from '../models/Admin.js';
import displayName from '../utils/displayName.js';

const r = Router(), DAY = 86400000;
const cleanQuestion = q => q.type === 'subjective'
  ? { type: 'subjective', text: q.text.trim(), maxMarks: q.maxMarks, instructions: (q.instructions || '').trim(),
      rubric: (q.rubric || '').trim(), keyConcepts: (q.keyConcepts || []).map(k => k.trim()).filter(Boolean), modelAnswer: (q.modelAnswer || '').trim() }
  : q.type === 'truefalse'
    ? { type: 'truefalse', text: q.text.trim(), options: ['True', 'False'], correct: Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 2 ? q.correct : 0 }
    : { type: 'mcq', text: q.text.trim(), options: q.options.map(o => o.trim()), correct: q.correct };
const validTz = tz => { try { return new Intl.DateTimeFormat('en', { timeZone: String(tz || 'UTC') }).resolvedOptions().timeZone; } catch { return 'UTC'; } };

// Find a paper by ID, then verify the requesting admin owns it (or is super).
const findPaper = async (id, req) => {
  const p = await Paper.findById(id);
  if (!p) throw httpError(404, 'Paper not found');
  if (!isOwner(req, p)) throw httpError(403, 'You do not have permission to access this paper.');
  return p;
};

// Dashboard data. Every number is counted from the database; the *Recent fields are real
// "created in the last 30 days" counts, not estimated trends.
// All statistics are scoped to the authenticated admin's own papers/results.
r.get('/stats', asyncHandler(async (req, res) => {
  const tz = validTz(req.query.tz), now = Date.now(), since30 = new Date(now - 30 * DAY), since14 = new Date(now - 13 * DAY);
  since14.setUTCHours(0, 0, 0, 0);
  const of = ownerFilter(req);

  // Fetch admin's own papers first; use paper codes to scope results/attempts.
  const papers = await Paper.find(of).select('-questions.options -questions.correct').lean();
  const myCodes = papers.map(p => p.code);
  const codeFilter = req.admin.isSuper ? {} : { paperCode: { $in: myCodes } };

  // For regular admins, get the roll numbers they manage to determine "their" students.
  let myRollNumbers = null;
  if (!req.admin.isSuper) {
    const rolls = await AllowedRollNumber.find(of).select('rollNumber').lean();
    myRollNumbers = rolls.map(r => r.rollNumber);
  }

  const studentFilter = myRollNumbers !== null ? { rollNumber: { $in: myRollNumbers } } : {};
  const studentRecentFilter = myRollNumbers !== null ? { rollNumber: { $in: myRollNumbers }, createdAt: { $gte: since30 } } : { createdAt: { $gte: since30 } };

  const [results, studentsTotal, studentsRecent, pendingRetakes, trend, recentGrants] = await Promise.all([
    Result.find(codeFilter).lean(),
    Student.countDocuments(studentFilter),
    Student.countDocuments(studentRecentFilter),
    RetakeGrant.countDocuments({ ...codeFilter, used: false, cancelled: false }),
    Result.aggregate([
      { $match: { ...codeFilter, createdAt: { $gte: since14 } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          submissions: { $sum: 1 },
          avg: { $avg: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$correct', '$total'] }, 0] } }
      } }
    ]),
    RetakeGrant.find(codeFilter).select('rollNumber paperCode used cancelled grantedBy updatedAt').sort({ updatedAt: -1 }).limit(6).lean()
  ]);

  const recentStudents = myRollNumbers !== null
    ? await Student.find({ rollNumber: { $in: myRollNumbers } }).select('name rollNumber createdAt').sort({ createdAt: -1 }).limit(6).lean()
    : await Student.find().select('name rollNumber createdAt').sort({ createdAt: -1 }).limit(6).lean();

  const latest = rankResults(results).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const by = Object.fromEntries(trend.map(t => [t._id, t]));
  const days = [...Array(14)].map((_, i) => {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now - (13 - i) * DAY));
    return { day: key, submissions: by[key]?.submissions || 0, averagePercent: by[key] ? Math.round(by[key].avg * 100) : null };
  });
  const buckets = [[0, 49], [50, 69], [70, 89], [90, 100]].map(([lo, hi]) => ({
    label: lo + '–' + hi + '%', count: results.filter(x => { const p = x.total ? Math.round(x.correct / x.total * 100) : 0; return p >= lo && p <= hi; }).length
  }));
  const titles = Object.fromEntries(papers.map(p => [p.code, p.title]));
  const activity = [
    ...recentStudents.map(s => ({ type: 'student', at: s.createdAt, title: 'New student registered', detail: s.name + ' (Roll: ' + s.rollNumber + ')' })),
    ...latest.map(x => ({ type: 'result', at: x.createdAt, title: 'Quiz completed', detail: x.paperTitle + ' by ' + x.name + ' · ' + x.correct + '/' + x.total })),
    ...[...papers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
      .map(p => ({ type: 'paper', at: p.createdAt, title: 'New quiz created', detail: p.title + ' (' + p.code + ')', paperId: p._id })),
    ...recentGrants.map(g => ({
      type: 'retake', at: g.updatedAt,
      title: g.cancelled ? 'Retake cancelled' : g.used ? 'Retake started' : 'Retake allowed',
      detail: (titles[g.paperCode] || g.paperCode) + ' · Roll ' + g.rollNumber
    }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  const upcoming = papers.map(p => paperSummary(p))
    .filter(p => p.status === 'scheduled' || p.status === 'active')
    .sort((a, b) => (a.status === 'scheduled' ? 0 : 1) - (b.status === 'scheduled' ? 0 : 1)
      || (a.status === 'scheduled' ? new Date(a.startsAt) - new Date(b.startsAt) : new Date(b.createdAt) - new Date(a.createdAt)))
    .slice(0, 6);
  res.json({
    papers: papers.length, active: papers.filter(isOpen).length, submissions: results.length, latest,
    students: studentsTotal, pendingRetakes,
    papersRecent: papers.filter(p => new Date(p.createdAt) >= since30).length,
    submissionsRecent: results.filter(x => new Date(x.createdAt) >= since30).length,
    studentsRecent, days, buckets, activity, upcoming
  });
}));

// Edit a paper's content and settings. Like /schedule, blocked once a real student has started
// or submitted it, so no one's questions or deadline change mid-exam or after grading.
r.patch('/papers/:id', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req), b = req.body || {};
  if (await Attempt.exists({ paperCode: p.code, preview: false }) || await Result.exists({ paperCode: p.code })) {
    throw httpError(400, 'Students have already taken this paper; its questions and timing can no longer be edited.');
  }
  const title = String(b.title || '').trim(), perQ = Number(b.perQ), timingMode = b.timingMode === 'customTotal' ? 'customTotal' : 'perQuestion';
  const customDuration = timingMode === 'customTotal' ? Number(b.customDuration) : 0;
  if (!title || title.length > 120) throw httpError(400, 'Give the paper a title (up to 120 characters).');
  if (!Number.isFinite(perQ) || perQ < 0 || perQ > 3600) throw httpError(400, 'Time per question must be from 0 to 60 minutes.');
  if (timingMode === 'customTotal' && (!Number.isFinite(customDuration) || customDuration <= 0 || customDuration > 86400 * 365)) throw httpError(400, 'Custom duration must be a positive value up to one year.');
  const qErr = validateQuestions(b.questions);
  if (qErr) throw httpError(400, qErr);
  const shuffleSettings = normalizeShuffleSettings(b);
  p.title = title; p.perQ = Math.round(perQ); p.timingMode = timingMode; p.customDuration = timingMode === 'customTotal' ? Math.round(customDuration) : 0;
  p.shuffleQuestions = shuffleSettings.shuffleQuestions;
  p.shuffleOptions = shuffleSettings.shuffleOptions;
  p.shuffle = shuffleSettings.shuffleQuestions || shuffleSettings.shuffleOptions;
  p.questions = b.questions.map(cleanQuestion);
  await p.save();
  res.json(paperSummary(p.toObject()));
}));

r.get('/papers', asyncHandler(async (req, res) => {
  const of = ownerFilter(req);
  const [papers, counts] = await Promise.all([
    Paper.find(of).sort({ createdAt: -1 }).lean(),
    Result.aggregate([
      ...(req.admin.isSuper ? [] : [{ $match: { adminId: { $in: [null, ...[]] } } }]),
      { $group: { _id: '$paperCode', n: { $sum: 1 } } }
    ])
  ]);
  // Re-derive result counts scoped to admin's own papers for the list view.
  const myCodes = new Set(papers.map(p => p.code));
  const allCounts = await Result.aggregate([{ $group: { _id: '$paperCode', n: { $sum: 1 } } }]);
  const by = Object.fromEntries(allCounts.filter(c => myCodes.has(c._id)).map(c => [c._id, c.n]));
  res.json(papers.map(p => paperSummary(p, by[p.code] || 0)));
}));

r.post('/papers', asyncHandler(async (req, res) => {
  const b = req.body || {}, title = String(b.title || '').trim();
  const perQ = Number(b.perQ), dur = b.durationMs == null ? null : Number(b.durationMs), timingMode = b.timingMode === 'customTotal' ? 'customTotal' : 'perQuestion';
  const customDuration = timingMode === 'customTotal' ? Number(b.customDuration) : 0;
  if (!title || title.length > 120) throw httpError(400, 'Give the paper a title (up to 120 characters).');
  if (!Number.isFinite(perQ) || perQ < 0 || perQ > 3600) throw httpError(400, 'Time per question must be from 0 to 60 minutes.');
  if (timingMode === 'customTotal' && (!Number.isFinite(customDuration) || customDuration <= 0 || customDuration > 86400 * 365)) throw httpError(400, 'Custom duration must be a positive value up to one year.');
  if (dur !== null && (!Number.isFinite(dur) || dur <= 0)) throw httpError(400, 'Enter how long the link stays active.');
  let startsAt = null;
  if (b.startsAt) { startsAt = new Date(b.startsAt); if (isNaN(startsAt)) throw httpError(400, 'Invalid start time.'); }
  const qErr = validateQuestions(b.questions);
  if (qErr) throw httpError(400, qErr);
  const shuffleSettings = normalizeShuffleSettings(b);
  const paper = await Paper.create({
    code: await generateCode(), title, perQ: Math.round(perQ), timingMode, customDuration: timingMode === 'customTotal' ? Math.round(customDuration) : 0,
    shuffleQuestions: shuffleSettings.shuffleQuestions,
    shuffleOptions: shuffleSettings.shuffleOptions,
    shuffle: shuffleSettings.shuffleQuestions || shuffleSettings.shuffleOptions,
    startsAt, expiresAt: dur === null ? null : new Date(Date.now() + dur), createdBy: req.admin.email,
    adminId: adminObjectId(req), // always set from the verified JWT, never from the request body
    questions: b.questions.map(cleanQuestion)
  });
  res.status(201).json(paperSummary(paper.toObject()));
}));

// Only joins to Attempt (for the per-student subjective evaluation breakdown) when the paper
// actually has subjective questions - a plain MCQ quiz, the common case, skips that query entirely.
r.get('/papers/:id', asyncHandler(async (req, res) => {
  const p = (await findPaper(req.params.id, req)).toObject();
  const results = rankResults(await Result.find({ paperCode: p.code }).lean());
  const hasSubjective = p.questions.some(q => q.type === 'subjective');
  let withEval = results;
  if (hasSubjective) {
    const attemptIds = results.map(r => r.attempt).filter(Boolean);
    const attempts = attemptIds.length ? await Attempt.find({ _id: { $in: attemptIds } }).select('evaluations').lean() : [];
    const byAttempt = new Map(attempts.map(a => {
      const evs = a.evaluations || [];
      return [String(a._id), {
        subjectiveTotal: evs.length,
        subjectiveApproved: evs.filter(e => e.status === 'approved').length,
        subjectivePending: evs.filter(e => ['pending', 'evaluating', 'awaiting_review'].includes(e.status)).length,
        subjectiveManualReview: evs.filter(e => e.status === 'manual_review').length,
        subjectiveFailed: evs.filter(e => e.status === 'failed').length
      }];
    }));
    withEval = results.map(r => ({ ...r, subjective: r.attempt ? byAttempt.get(String(r.attempt)) || null : null }));
  }
  const creator = p.adminId ? await Admin.findById(p.adminId).select('name email').lean() : null;
  res.json({
    paper: { ...paperSummary(p, results.length), questions: p.questions, createdByName: creator ? displayName(creator) : null },
    results: withEval, stats: paperStats(results)
  });
}));

r.post('/papers/:id/extend', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req), ms = Number(req.body?.ms);
  if (!p.expiresAt) throw httpError(400, 'This link never expires.');
  if (!Number.isFinite(ms) || ms <= 0 || ms > 365 * DAY) throw httpError(400, 'Invalid extension.');
  p.expiresAt = new Date(Math.max(Date.now(), p.expiresAt.getTime()) + ms);
  await p.save(); res.json(paperSummary(p.toObject()));
}));

r.post('/papers/:id/close', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req);
  p.expiresAt = new Date(); await p.save(); res.json(paperSummary(p.toObject()));
}));

r.post('/papers/:id/reopen', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req), ms = Number(req.body?.ms) || DAY;
  if (ms <= 0 || ms > 365 * DAY) throw httpError(400, 'Invalid duration.');
  p.expiresAt = new Date(Date.now() + ms); await p.save(); res.json(paperSummary(p.toObject()));
}));

// Setting/clearing the scheduled start is blocked once a real (non-preview) attempt exists,
// so the deadline a student is already relying on can't be moved out from under them.
r.post('/papers/:id/schedule', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req);
  if (await Attempt.exists({ paperCode: p.code, preview: false })) {
    throw httpError(400, 'Students have already started this paper; its start time can no longer be changed.');
  }
  let startsAt = null;
  if (req.body?.startsAt) { startsAt = new Date(req.body.startsAt); if (isNaN(startsAt)) throw httpError(400, 'Invalid start time.'); }
  p.startsAt = startsAt; await p.save(); res.json(paperSummary(p.toObject()));
}));

r.post('/papers/:id/preview', asyncHandler(async (req, res) => {
  const p = (await findPaper(req.params.id, req)).toObject();
  const run = buildRun(p.questions, {
    shuffleQuestions: !!(p.shuffleQuestions ?? p.shuffle ?? false),
    shuffleOptions: !!(p.shuffleOptions ?? false)
  });
  const attempt = await Attempt.create({
    paperCode: p.code, paperTitle: p.title, name: 'Admin', roll: '-', email: req.admin.email, preview: true, run, ...newAttemptFields(p, run)
  });
  res.json(attemptPayload(attempt, p));
}));

r.delete('/papers/:id/results', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req);
  await Result.deleteMany({ paperCode: p.code }); res.json({ ok: true });
}));

r.delete('/papers/:id', asyncHandler(async (req, res) => {
  const p = await findPaper(req.params.id, req);
  await Promise.all([Paper.deleteOne({ _id: p._id }), Result.deleteMany({ paperCode: p.code }), Attempt.deleteMany({ paperCode: p.code })]);
  res.json({ ok: true });
}));

export default r;
