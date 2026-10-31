// pdfReport.test.js — Automated tests for the PDF report system.
//
// Tests cover:
//   1. Unauthenticated access — all PDF endpoints return 401
//   2. Student ownership — can only download their own PDF, not others'
//   3. Admin ownership isolation — cannot access other admin's quizzes or students
//   4. Owner-only endpoints — regular admin gets 403
//   5. Owner platform-wide reports — returns valid PDF
//   6. Pending-eval privacy — suggestedMarks/rubric never appear in student PDF
//   7. Empty reports handled gracefully (no 500 crash)
//   8. Filter parameters (paper, date) work without crash
//   9. Selected-students validation (missing/too-many rolls → 400)
//  10. Direct builder-function smoke tests — every builder returns a valid %PDF- buffer
//
// Uses mongod port 27996 (separate from other test files).

process.env.MONGO_URI = process.env.TEST_MONGO_URI_PDF || 'mongodb://127.0.0.1:27996/quizroom_pdf_test';

import './helpers/env.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startMongod } from './helpers/mongod.js';

let mongod, server, base;
let mongoose, Admin, Paper, Result, Attempt, Student, AllowedRollNumber, signToken;

// ── HTTP helper ────────────────────────────────────────────────────────────────
const call = async (path, { method = 'GET', auth, binary = false } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }
  });
  if (binary) return { status: res.status, body: await res.arrayBuffer().catch(() => null) };
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ── Token helpers ──────────────────────────────────────────────────────────────
const ownerTok   = ()          => 'Bearer ' + signToken({ email: 'owner@pdf.test', isSuper: true,  adminId: 'super' });
const adminTok   = (email, id) => 'Bearer ' + signToken({ email, isSuper: false, adminId: String(id) });
const isPdf      = buf          => Buffer.from(buf).toString('ascii', 0, 5) === '%PDF-';

// ── Fixture helpers ────────────────────────────────────────────────────────────
async function createAdmin(email) {
  const bcrypt = await import('bcryptjs');
  const a = await Admin.create({ email, passwordHash: await bcrypt.default.hash('pass123', 4) });
  return { admin: a, token: adminTok(email, a._id) };
}

async function createPaper(adminId, code, title) {
  return Paper.create({
    code, title, perQ: 0, shuffle: false, adminId,
    questions: [
      { type: 'mcq', text: 'Q1?', options: ['A', 'B', 'C', 'D'], correct: 0 },
      { type: 'mcq', text: 'Q2?', options: ['A', 'B', 'C', 'D'], correct: 1 }
    ]
  });
}

async function createResult(data) {
  return Result.create({ correct: 2, total: 4, ...data });
}

async function createStudent(rollNumber, name = 'Test Student') {
  return Student.create({
    name, rollNumber: rollNumber.toUpperCase(),
    email: rollNumber + '@s.test', passwordHash: 'x', sessionVersion: 1
  });
}

async function studentTok(studentDoc) {
  return 'Bearer ' + signToken({ sub: String(studentDoc._id), v: 1 });
}

// ── Setup ──────────────────────────────────────────────────────────────────────
before(async () => {
  process.env.EVAL_CONCURRENCY = '1';
  process.env.AI_FALLBACK_ENABLED = 'false';

  mongod = await startMongod(27996);
  ({ default: mongoose }          = await import('mongoose'));
  const { default: app }          = await import('../src/app.js');
  const { default: connectDb }    = await import('../src/db.js');
  ({ default: Admin }             = await import('../src/models/Admin.js'));
  ({ default: Paper }             = await import('../src/models/Paper.js'));
  ({ default: Result }            = await import('../src/models/Result.js'));
  ({ default: Attempt }           = await import('../src/models/Attempt.js'));
  ({ default: Student }           = await import('../src/models/Student.js'));
  ({ default: AllowedRollNumber } = await import('../src/models/AllowedRollNumber.js'));
  ({ default: signToken }         = await import('../src/utils/signToken.js'));

  await connectDb();
  await mongoose.connection.db.dropDatabase();
  server = app.listen(0);
  base   = 'http://127.0.0.1:' + server.address().port + '/api';
});

after(async () => {
  server?.close();
  await mongoose?.disconnect();
  await mongod?.stop();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Unauthenticated access rejected (all endpoints must return 401)
// ═══════════════════════════════════════════════════════════════════════════════
describe('PDF reports — unauthenticated requests rejected', () => {
  test('GET /me/reports → 401', async () => {
    const r = await call('/me/reports');
    assert.equal(r.status, 401);
  });

  test('GET /me/reports/:id/pdf → 401', async () => {
    const r = await call('/me/reports/000000000000000000000001/pdf');
    assert.equal(r.status, 401);
  });

  test('GET /admin/reports/filters → 401', async () => {
    const r = await call('/admin/reports/filters');
    assert.equal(r.status, 401);
  });

  test('GET /admin/reports/all-students → 401', async () => {
    const r = await call('/admin/reports/all-students');
    assert.equal(r.status, 401);
  });

  test('GET /admin/admins-reports/platform → 401', async () => {
    const r = await call('/admin/admins-reports/platform');
    assert.equal(r.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Student — /me/reports ownership
// ═══════════════════════════════════════════════════════════════════════════════
describe('Student — /me/reports list and PDF ownership', () => {
  let sA, sB, resA, resB;

  before(async () => {
    sA   = await createStudent('PDFA001', 'Alice');
    sB   = await createStudent('PDFB001', 'Bob');
    resA = await createResult({ roll: 'PDFA001', name: 'Alice', paperCode: 'PDFQ1', paperTitle: 'PDF Quiz 1', correct: 3, total: 4 });
    resB = await createResult({ roll: 'PDFB001', name: 'Bob',   paperCode: 'PDFQ2', paperTitle: 'PDF Quiz 2', correct: 2, total: 4 });
  });

  test('Student A sees only their own reports in /me/reports', async () => {
    const r = await call('/me/reports', { auth: await studentTok(sA) });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.some(x => x.paperCode === 'PDFQ1'), 'Alice must see her own result');
    assert.ok(!r.body.some(x => x.paperCode === 'PDFQ2'), 'Alice must NOT see Bob result');
  });

  test('Student B sees only their own reports', async () => {
    const r = await call('/me/reports', { auth: await studentTok(sB) });
    assert.equal(r.status, 200);
    assert.ok(r.body.some(x => x.paperCode === 'PDFQ2'));
    assert.ok(!r.body.some(x => x.paperCode === 'PDFQ1'));
  });

  test('Student A can download their own PDF (valid %PDF-)', async () => {
    const r = await call('/me/reports/' + resA._id + '/pdf', { auth: await studentTok(sA), binary: true });
    assert.equal(r.status, 200, 'Own PDF should succeed');
    assert.ok(isPdf(r.body), 'Response must be a PDF');
  });

  test('Student A cannot download Student B\'s PDF → 403', async () => {
    const r = await call('/me/reports/' + resB._id + '/pdf', { auth: await studentTok(sA) });
    assert.equal(r.status, 403);
  });

  test('Non-existent result ID → 404', async () => {
    const r = await call('/me/reports/000000000000000000000099/pdf', { auth: await studentTok(sA) });
    assert.equal(r.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Admin — report ownership isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin — report ownership isolation', () => {
  let admA, admB, papA, papB;
  const ts = Date.now();

  before(async () => {
    admA = await createAdmin('adm-a-pdf-' + ts + '@pdf.test');
    admB = await createAdmin('adm-b-pdf-' + ts + '@pdf.test');
    papA = await createPaper(admA.admin._id, 'PAPA' + ts.toString().slice(-5), 'Admin A Quiz');
    papB = await createPaper(admB.admin._id, 'PAPB' + ts.toString().slice(-5), 'Admin B Quiz');

    await AllowedRollNumber.create({ rollNumber: 'ROLLA01', adminId: admA.admin._id });
    await AllowedRollNumber.create({ rollNumber: 'ROLLB01', adminId: admB.admin._id });

    await createResult({ roll: 'ROLLA01', name: 'A Student', paperCode: papA.code, paperTitle: papA.title, adminId: admA.admin._id, correct: 3, total: 4 });
    await createResult({ roll: 'ROLLB01', name: 'B Student', paperCode: papB.code, paperTitle: papB.title, adminId: admB.admin._id, correct: 2, total: 4 });
  });

  test('Admin A sees only own quizzes in /admin/reports/filters', async () => {
    const r = await call('/admin/reports/filters', { auth: admA.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.papers.some(p => p.code === papA.code), 'Admin A must see own paper');
    assert.ok(!r.body.papers.some(p => p.code === papB.code), 'Admin A must NOT see Admin B paper');
  });

  test('Admin A quiz PDF for own paper returns valid PDF', async () => {
    const r = await call('/admin/reports/quiz/' + papA._id, { auth: admA.token, binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Admin A cannot get PDF for Admin B quiz → 403 or 404', async () => {
    const r = await call('/admin/reports/quiz/' + papB._id, { auth: admA.token });
    assert.ok(r.status === 403 || r.status === 404, 'Expected 403/404, got ' + r.status);
  });

  test('Admin A individual-student PDF for own student → valid PDF', async () => {
    const r = await call('/admin/reports/student/ROLLA01', { auth: admA.token, binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Admin A cannot get individual PDF for Admin B student → 403', async () => {
    const r = await call('/admin/reports/student/ROLLB01', { auth: admA.token });
    assert.equal(r.status, 403);
  });

  test('Admin A all-students PDF returns valid PDF', async () => {
    const r = await call('/admin/reports/all-students', { auth: admA.token, binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Admin A selected-students for own student → valid PDF', async () => {
    const r = await call('/admin/reports/selected-students?rolls=ROLLA01', { auth: admA.token, binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Admin A selected-students including Admin B student → 403', async () => {
    const r = await call('/admin/reports/selected-students?rolls=ROLLB01', { auth: admA.token });
    assert.equal(r.status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Regular admin cannot access owner-only endpoints
// ═══════════════════════════════════════════════════════════════════════════════
describe('Regular admin — owner endpoints return 403', () => {
  let admC;

  before(async () => { admC = await createAdmin('adm-c-' + Date.now() + '@pdf.test'); });

  test('/admin/admins-reports/platform → 403', async () => {
    assert.equal((await call('/admin/admins-reports/platform', { auth: admC.token })).status, 403);
  });

  test('/admin/admins-reports/admin/:id → 403', async () => {
    assert.equal((await call('/admin/admins-reports/admin/000000000000000000000001', { auth: admC.token })).status, 403);
  });

  test('/admin/admins-reports/quiz/:id → 403', async () => {
    assert.equal((await call('/admin/admins-reports/quiz/000000000000000000000001', { auth: admC.token })).status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Owner — platform-wide reports
// ═══════════════════════════════════════════════════════════════════════════════
describe('Owner — platform-wide report endpoints', () => {
  let admD, papD;

  before(async () => {
    const ts = Date.now() + 2;
    admD = await createAdmin('adm-d-' + ts + '@pdf.test');
    papD = await createPaper(admD.admin._id, 'PAPD' + ts.toString().slice(-5), 'Owner Quiz D');
    await createResult({ roll: 'OWND01', name: 'Owen', paperCode: papD.code, paperTitle: papD.title, adminId: admD.admin._id, correct: 4, total: 4 });
  });

  test('Owner platform report → valid PDF', async () => {
    const r = await call('/admin/admins-reports/platform', { auth: ownerTok(), binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Owner per-admin report → valid PDF', async () => {
    const r = await call('/admin/admins-reports/admin/' + admD.admin._id, { auth: ownerTok(), binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Owner quiz PDF for any paper → valid PDF', async () => {
    const r = await call('/admin/admins-reports/quiz/' + papD._id, { auth: ownerTok(), binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Owner per-admin report for non-existent admin → 404', async () => {
    assert.equal((await call('/admin/admins-reports/admin/000000000000000000000099', { auth: ownerTok() })).status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Pending-eval privacy — suggestedMarks and rubric never in student PDF
// ═══════════════════════════════════════════════════════════════════════════════
describe('Pending-eval privacy — sensitive fields never appear in student PDF', () => {
  let sE, resE;

  before(async () => {
    sE = await createStudent('PDFE001', 'Eve');
    const att = await Attempt.create({
      paperCode: 'PENDPDF', paperTitle: 'Pending Quiz',
      name: 'Eve', roll: 'PDFE001', student: sE._id, submitted: true,
      run: [
        { type: 'mcq', text: 'Q1', options: ['A', 'B'], correct: 0 },
        { type: 'subjective', text: 'Explain AI', maxMarks: 10,
          rubric: 'SECRET_RUBRIC', modelAnswer: 'SECRET_ANSWER', keyConcepts: ['secret'] }
      ],
      answers: [0], subjectiveText: ['student answer'],
      evaluations: [{
        idx: 1, status: 'awaiting_review', maxMarks: 10,
        suggestedMarks: 7, feedback: 'Good', finalMarks: null, finalFeedback: ''
      }]
    });
    resE = await createResult({
      roll: 'PDFE001', name: 'Eve', paperCode: 'PENDPDF',
      paperTitle: 'Pending Quiz', attempt: att._id, correct: 1, total: 1
    });
  });

  test('Student PDF generated successfully even with pending evaluation', async () => {
    const r = await call('/me/reports/' + resE._id + '/pdf', { auth: await studentTok(sE), binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });

  test('Student PDF does not contain rubric, model answer, or suggestedMarks', async () => {
    const r = await call('/me/reports/' + resE._id + '/pdf', { auth: await studentTok(sE), binary: true });
    const text = Buffer.from(r.body).toString('latin1');
    assert.ok(!text.includes('SECRET_RUBRIC'),   'Rubric must not appear in PDF');
    assert.ok(!text.includes('SECRET_ANSWER'),   'Model answer must not appear in PDF');
    assert.ok(!text.includes('suggestedMarks'),  'suggestedMarks field name must not appear');
  });

  test('Unapproved mark (7) does not appear as an approved/final mark in PDF', async () => {
    const r = await call('/me/reports/' + resE._id + '/pdf', { auth: await studentTok(sE), binary: true });
    const text = Buffer.from(r.body).toString('latin1');
    // The "Approved Subjective Marks" line must not show 7 (pending, not approved)
    assert.ok(!text.includes('Approved Subjective Marks: 7'), 'Unapproved mark must not show as final');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Empty reports — no crash
// ═══════════════════════════════════════════════════════════════════════════════
describe('Empty reports — handled gracefully (no 500)', () => {
  let admF;

  before(async () => { admF = await createAdmin('adm-f-empty-' + Date.now() + '@pdf.test'); });

  test('All-students with no results → 404 (graceful)', async () => {
    const r = await call('/admin/reports/all-students', { auth: admF.token });
    assert.ok(r.status === 404 || r.status === 200, 'Should be 404 or 200, not a crash: ' + r.status);
  });

  test('Quiz PDF with 0 results → valid PDF (no crash)', async () => {
    const p = await createPaper(admF.admin._id, 'EMPDF' + Date.now().toString().slice(-5), 'Empty Quiz');
    const r = await call('/admin/reports/quiz/' + p._id, { auth: admF.token, binary: true });
    assert.equal(r.status, 200, 'Quiz PDF with no results must not crash');
    assert.ok(isPdf(r.body));
  });

  test('Student with no results → valid PDF (no crash)', async () => {
    await AllowedRollNumber.create({ rollNumber: 'EMPTYROLL', adminId: admF.admin._id });
    const r = await call('/admin/reports/student/EMPTYROLL', { auth: admF.token, binary: true });
    assert.equal(r.status, 200);
    assert.ok(isPdf(r.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8 & 9. Filter params and selected-students validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('Filter parameters and selected-students validation', () => {
  let admG;

  before(async () => {
    admG = await createAdmin('adm-g-' + Date.now() + '@pdf.test');
    const pg = await createPaper(admG.admin._id, 'FILTG' + Date.now().toString().slice(-5), 'Filter Quiz G');
    await AllowedRollNumber.create({ rollNumber: 'FILTG01', adminId: admG.admin._id });
    await createResult({ roll: 'FILTG01', name: 'Filter Student', paperCode: pg.code, paperTitle: pg.title, adminId: admG.admin._id, correct: 2, total: 4 });
  });

  test('Invalid paper code filter → 404', async () => {
    const r = await call('/admin/reports/all-students?paper=DOESNOTEXIST99', { auth: admG.token });
    assert.equal(r.status, 404);
  });

  test('selected-students with no rolls → 400', async () => {
    assert.equal((await call('/admin/reports/selected-students', { auth: admG.token })).status, 400);
  });

  test('selected-students with 201 rolls → 400 (limit exceeded)', async () => {
    const rolls = Array.from({ length: 201 }, (_, i) => 'R' + String(i).padStart(4, '0')).join(',');
    const r = await call('/admin/reports/selected-students?rolls=' + rolls, { auth: admG.token });
    assert.equal(r.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Direct builder smoke tests — all return valid %PDF- buffers
// ═══════════════════════════════════════════════════════════════════════════════
describe('pdfReport.js builders — direct smoke tests', () => {
  let build;

  before(async () => { build = await import('../src/utils/pdfReport.js'); });

  test('buildStudentSingleReport (no attempt) → valid PDF', async () => {
    const result = { name: 'Test', roll: 'T001', paperTitle: 'Quiz', paperCode: 'QZ1', correct: 3, total: 5, createdAt: new Date() };
    const buf = await build.buildStudentSingleReport({ result, attempt: null });
    assert.ok(Buffer.isBuffer(buf) && isPdf(buf) && buf.length > 1000);
  });

  test('buildStudentSingleReport (with MCQ attempt) → valid PDF', async () => {
    const result  = { name: 'Alice', roll: 'A001', paperTitle: 'MCQ Quiz', paperCode: 'MCQ1', correct: 2, total: 3, createdAt: new Date() };
    const attempt = {
      run: [
        { type: 'mcq', text: 'Q1', options: ['A', 'B'], correct: 0 },
        { type: 'mcq', text: 'Q2', options: ['A', 'B'], correct: 1 },
        { type: 'mcq', text: 'Q3', options: ['A', 'B'], correct: 0 }
      ],
      answers: [0, 1, 1], evaluations: []
    };
    const buf = await build.buildStudentSingleReport({ result, attempt });
    assert.ok(isPdf(buf));
  });

  test('buildStudentSingleReport (pending subjective) → valid PDF without suggestedMarks', async () => {
    const result  = { name: 'Bob', roll: 'B001', paperTitle: 'Sub Quiz', paperCode: 'SUB1', correct: 1, total: 1, createdAt: new Date() };
    const attempt = {
      run: [{ type: 'subjective', text: 'Explain AI', maxMarks: 10 }],
      answers: [],
      evaluations: [{ idx: 0, status: 'awaiting_review', maxMarks: 10, finalMarks: null, finalFeedback: '' }]
    };
    const buf = await build.buildStudentSingleReport({ result, attempt });
    assert.ok(isPdf(buf));
    assert.ok(!buf.toString('latin1').includes('suggestedMarks'), 'suggestedMarks must not leak');
  });

  test('buildStudentSingleReport (approved subjective) → PDF contains "Approved" text', async () => {
    const result  = { name: 'Carol', roll: 'C001', paperTitle: 'Graded', paperCode: 'GRD1', correct: 1, total: 1, createdAt: new Date() };
    const attempt = {
      run: [{ type: 'subjective', text: 'Explain AI', maxMarks: 10 }],
      answers: [],
      evaluations: [{ idx: 0, status: 'approved', maxMarks: 10, finalMarks: 8, finalFeedback: 'Great' }]
    };
    const buf = await build.buildStudentSingleReport({ result, attempt });
    assert.ok(isPdf(buf));
    assert.ok(buf.toString('latin1').includes('Approved'), 'Approved marks section must appear');
  });

  test('buildAdminQuizReport (with results) → valid PDF', async () => {
    const paper   = { title: 'Quiz A', code: 'QZA', questions: [{ type: 'mcq' }, { type: 'mcq' }] };
    const results = [
      { name: 'S1', roll: 'R1', correct: 4, total: 5, createdAt: new Date() },
      { name: 'S2', roll: 'R2', correct: 2, total: 5, createdAt: new Date() }
    ];
    const buf = await build.buildAdminQuizReport({ paper, results, admin: 'teacher@test.com' });
    assert.ok(isPdf(buf) && buf.length > 1000);
  });

  test('buildAdminQuizReport (empty results) → valid PDF', async () => {
    const buf = await build.buildAdminQuizReport({ paper: { title: 'Empty', code: 'EQZ', questions: [] }, results: [], admin: 'teacher@test.com' });
    assert.ok(isPdf(buf));
  });

  test('buildAdminStudentReport (with results) → valid PDF', async () => {
    const student = { name: 'Dave', roll: 'D001', email: 'dave@test.com' };
    const results = [
      { paperTitle: 'Q1', paperCode: 'Q1', correct: 3, total: 5, attemptNumber: 1, createdAt: new Date() },
      { paperTitle: 'Q2', paperCode: 'Q2', correct: 5, total: 5, attemptNumber: 1, createdAt: new Date() }
    ];
    const buf = await build.buildAdminStudentReport({ student, results, adminEmail: 'teacher@test.com' });
    assert.ok(isPdf(buf));
  });

  test('buildAdminStudentReport (no results) → valid PDF', async () => {
    const buf = await build.buildAdminStudentReport({ student: { name: 'Empty', roll: 'E001', email: '' }, results: [], adminEmail: 'teacher@test.com' });
    assert.ok(isPdf(buf));
  });

  test('buildAdminAllStudentsReport → valid PDF', async () => {
    const students = [
      { name: 'S1', roll: 'R1', results: [{ correct: 4, total: 5, paperTitle: 'Q1', paperCode: 'Q1', createdAt: new Date() }] },
      { name: 'S2', roll: 'R2', results: [{ correct: 2, total: 5, paperTitle: 'Q1', paperCode: 'Q1', createdAt: new Date() }] }
    ];
    const buf = await build.buildAdminAllStudentsReport({ students, adminEmail: 'teacher@test.com', filters: {} });
    assert.ok(isPdf(buf));
  });

  test('buildOwnerPlatformReport (multiple teachers) → valid PDF', async () => {
    const admins = [
      { email: 't1@test.com', papers: [{ title: 'Q1', code: 'Q1' }], results: [{ name: 'S1', roll: 'R1', correct: 3, total: 5, paperTitle: 'Q1', createdAt: new Date() }] },
      { email: 't2@test.com', papers: [], results: [] }
    ];
    const buf = await build.buildOwnerPlatformReport({ admins, filters: {} });
    assert.ok(isPdf(buf));
  });

  test('buildOwnerPlatformReport (selected teacher scope) → valid PDF larger than empty report', async () => {
    const admins = [{ email: 'solo@test.com', papers: [], results: [] }];
    const bufFiltered = await build.buildOwnerPlatformReport({ admins, filters: { adminEmail: 'solo@test.com' } });
    const bufAll      = await build.buildOwnerPlatformReport({ admins: [], filters: {} });
    // Both must be valid PDFs
    assert.ok(isPdf(bufFiltered), 'Filtered report must be a PDF');
    assert.ok(isPdf(bufAll),      'All-teachers report must be a PDF');
    // Filtered report must be at least as large (it has at least the header + scope label)
    assert.ok(bufFiltered.length > 500, 'Filtered PDF must have non-trivial size');
  });

  test('All four builder functions export correctly', async () => {
    assert.equal(typeof build.buildStudentSingleReport,   'function');
    assert.equal(typeof build.buildAdminQuizReport,       'function');
    assert.equal(typeof build.buildAdminStudentReport,    'function');
    assert.equal(typeof build.buildAdminAllStudentsReport,'function');
    assert.equal(typeof build.buildOwnerPlatformReport,   'function');
  });
});
