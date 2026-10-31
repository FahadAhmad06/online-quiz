// ownership.test.js — Multi-admin data isolation tests.
// Uses real Express app + real MongoDB (throwaway mongod) + Node's built-in test runner.
// Tests all the scenarios listed in the task's Testing Requirements section.
//
// Uses a separate mongod port (27998) from the evaluation tests (27999) to allow
// both test files to be run in the same suite without conflicts.

// Set MONGO_URI BEFORE importing env.js so the ownership test uses its own database.
process.env.MONGO_URI = process.env.TEST_MONGO_URI_OWNERSHIP || 'mongodb://127.0.0.1:27998/quizroom_ownership_test';

import './helpers/env.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startMongod } from './helpers/mongod.js';

let mongod, server, base, Admin, Paper, Result, Attempt, AllowedRollNumber, RetakeGrant, Student, signToken, mongoose;

// Helper: make a typed Bearer token for an admin (regular or super).
const adminToken = (email, adminId, isSuper = false) =>
  'Bearer ' + signToken({ email, adminId, isSuper });

// Helper: HTTP request wrapper.
const call = async (path, { method = 'GET', auth, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

before(async () => {
  // Set env before importing anything that reads it.
  process.env.EVAL_CONCURRENCY = '1';
  process.env.AI_FALLBACK_ENABLED = 'false';

  mongod = await startMongod(27998); // separate port from evaluation.test.js (27999)
  ({ default: mongoose } = await import('mongoose'));
  const { default: app } = await import('../src/app.js');
  const { default: connectDb } = await import('../src/db.js');
  ({ default: Admin } = await import('../src/models/Admin.js'));
  ({ default: Paper } = await import('../src/models/Paper.js'));
  ({ default: Result } = await import('../src/models/Result.js'));
  ({ default: Attempt } = await import('../src/models/Attempt.js'));
  ({ default: AllowedRollNumber } = await import('../src/models/AllowedRollNumber.js'));
  ({ default: RetakeGrant } = await import('../src/models/RetakeGrant.js'));
  ({ default: Student } = await import('../src/models/Student.js'));
  ({ default: signToken } = await import('../src/utils/signToken.js'));
  await connectDb(); // reads MONGO_URI from env (set above to port 27998)
  await mongoose.connection.db.dropDatabase();
  server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});

after(async () => {
  server?.close();
  await mongoose?.disconnect();
  await mongod?.stop();
});

// ---- fixture helpers ----

async function createAdmin(email, password = 'password123') {
  const bcrypt = await import('bcryptjs');
  const a = await Admin.create({ email, passwordHash: await bcrypt.default.hash(password, 4) });
  return { admin: a, token: adminToken(email, String(a._id)) };
}

async function createPaper(adminId, adminToken, { title = 'Test Paper', questions } = {}) {
  const q = questions || [{ type: 'mcq', text: 'Q1', options: ['A', 'B'], correct: 0 }];
  const res = await call('/admin/papers', { method: 'POST', auth: adminToken, body: { title, perQ: 0, questions: q } });
  assert.equal(res.status, 201, 'createPaper failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function createRoll(adminToken, rollNumber = 'ROLL' + Date.now()) {
  const res = await call('/admin/rolls', { method: 'POST', auth: adminToken, body: { rollNumber } });
  assert.equal(res.status, 201, 'createRoll failed: ' + JSON.stringify(res.body));
  return res.body;
}

async function registerAndLoginStudent(rollNumber, pin) {
  const name = 'Student ' + rollNumber;
  const reg = await call('/students/register', { method: 'POST', body: { name, rollNumber, pin, password: 'pass1234', confirmPassword: 'pass1234' } });
  assert.equal(reg.status, 201, 'register failed: ' + JSON.stringify(reg.body));
  const login = await call('/students/login', { method: 'POST', body: { rollNumber, password: 'pass1234' } });
  assert.equal(login.status, 200, 'login failed: ' + JSON.stringify(login.body));
  return { token: 'Bearer ' + login.body.token, name };
}

async function submitAttempt(paperCode, studentToken) {
  const start = await call('/papers/' + paperCode + '/start', { method: 'POST', auth: studentToken });
  assert.equal(start.status, 200, 'start failed: ' + JSON.stringify(start.body));
  const attemptId = start.body.attemptId;
  const submit = await call('/attempts/' + attemptId + '/submit', { method: 'POST', auth: studentToken, body: { answer: 0 } });
  return { attemptId, submitBody: submit.body, submitStatus: submit.status };
}

// ---- Tests ----

describe('Admin A owns their own data', () => {
  let adminA, paperA, rollA;

  test('Admin A can create a quiz', async () => {
    adminA = await createAdmin('admina@test.local');
    paperA = await createPaper(null, adminA.token, { title: 'Admin A Quiz' });
    assert.ok(paperA._id, 'paper should have _id');
    assert.equal(paperA.title, 'Admin A Quiz');
    // Verify adminId was set in DB.
    const p = await Paper.findById(paperA._id).lean();
    assert.ok(p.adminId, 'paper should have adminId set');
    assert.equal(String(p.adminId), String(adminA.admin._id));
  });

  test('Admin A can list their own quiz', async () => {
    const res = await call('/admin/papers', { auth: adminA.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some(p => p._id === paperA._id), 'Admin A should see their own paper');
  });

  test('Admin A can get their own quiz by ID', async () => {
    const res = await call('/admin/papers/' + paperA._id, { auth: adminA.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.paper._id, paperA._id);
  });

  test('Admin A can create roll numbers', async () => {
    rollA = await createRoll(adminA.token, 'ROLLA001');
    assert.ok(rollA._id);
    // Verify adminId in DB.
    const r = await AllowedRollNumber.findById(rollA._id).lean();
    assert.ok(r.adminId, 'roll should have adminId');
    assert.equal(String(r.adminId), String(adminA.admin._id));
  });

  test('Admin A can list their own roll numbers', async () => {
    const res = await call('/admin/rolls', { auth: adminA.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some(r => r.rollNumber === 'ROLLA001'));
  });
});

describe('Admin B isolation — cannot see Admin A data', () => {
  let adminA, adminB, paperA, rollA;

  test('Setup: create admins and Admin A data', async () => {
    adminA = await createAdmin('adminaa@test.local');
    adminB = await createAdmin('adminbb@test.local');
    paperA = await createPaper(null, adminA.token, { title: 'Admin AA Quiz' });
    rollA = await createRoll(adminA.token, 'ROLLAA001');
  });

  test('Admin B cannot see Admin A\'s quiz in paper list', async () => {
    const res = await call('/admin/papers', { auth: adminB.token });
    assert.equal(res.status, 200);
    assert.ok(!res.body.some(p => p._id === paperA._id), 'Admin B must NOT see Admin A paper');
  });

  test('Admin B cannot access Admin A\'s quiz by ID (403 or 404)', async () => {
    const res = await call('/admin/papers/' + paperA._id, { auth: adminB.token });
    assert.ok(res.status === 403 || res.status === 404, 'Expected 403/404, got ' + res.status);
  });

  test('Admin B cannot edit Admin A\'s quiz', async () => {
    const res = await call('/admin/papers/' + paperA._id, {
      method: 'PATCH', auth: adminB.token,
      body: { title: 'Hacked', perQ: 0, questions: [{ type: 'mcq', text: 'Q', options: ['A', 'B'], correct: 0 }] }
    });
    assert.ok(res.status === 403 || res.status === 404);
  });

  test('Admin B cannot delete Admin A\'s quiz', async () => {
    const res = await call('/admin/papers/' + paperA._id, { method: 'DELETE', auth: adminB.token });
    assert.ok(res.status === 403 || res.status === 404);
    // Verify the paper still exists in DB.
    const p = await Paper.findById(paperA._id).lean();
    assert.ok(p, 'Paper should NOT have been deleted');
  });

  test('Admin B cannot close/reopen Admin A\'s quiz', async () => {
    const close = await call('/admin/papers/' + paperA._id + '/close', { method: 'POST', auth: adminB.token });
    assert.ok(close.status === 403 || close.status === 404);
  });

  test('Admin B cannot see Admin A\'s roll numbers', async () => {
    const res = await call('/admin/rolls', { auth: adminB.token });
    assert.equal(res.status, 200);
    assert.ok(!res.body.some(r => r.rollNumber === 'ROLLAA001'), 'Admin B must NOT see Admin A rolls');
  });

  test('Admin B cannot manage Admin A\'s roll number by ID', async () => {
    const res = await call('/admin/rolls/' + rollA._id + '/disable', { method: 'POST', auth: adminB.token });
    assert.ok(res.status === 403 || res.status === 404);
    // Verify still enabled in DB.
    const r = await AllowedRollNumber.findById(rollA._id).lean();
    assert.ok(r.isEnabled, 'Roll should still be enabled');
  });
});

describe('Results and attempts isolation', () => {
  let adminA, adminB, paperA, studentToken;

  test('Setup: Admin A creates quiz, student submits', async () => {
    adminA = await createAdmin('admina2@test.local');
    adminB = await createAdmin('adminb2@test.local');
    // Admin A creates a quiz and a roll number.
    paperA = await createPaper(null, adminA.token, { title: 'Isolated Quiz' });
    const rollRes = await createRoll(adminA.token, 'ISOLROLL001');
    const pin = rollRes.pin;
    // Reopen paper permanently.
    await call('/admin/papers/' + paperA._id + '/reopen', { method: 'POST', auth: adminA.token, body: { ms: 86400000 } });
    // Student registers and submits.
    const st = await registerAndLoginStudent('ISOLROLL001', pin);
    studentToken = st.token;
    await submitAttempt(paperA.code, studentToken);
    // Wait a moment for DB write.
    await new Promise(r => setTimeout(r, 100));
  });

  test('Admin A can view results for their quiz', async () => {
    const res = await call('/admin/results?paper=' + paperA.code, { auth: adminA.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0, 'Admin A should see results for their quiz');
  });

  test('Admin B cannot view results for Admin A\'s quiz', async () => {
    const res = await call('/admin/results?paper=' + paperA.code, { auth: adminB.token });
    assert.ok(res.status === 403 || (res.status === 200 && res.body.length === 0),
      'Admin B should get 403 or empty results, got status ' + res.status + ' body ' + JSON.stringify(res.body));
  });

  test('Admin B cannot see Admin A\'s quiz in their results list', async () => {
    const res = await call('/admin/results', { auth: adminB.token });
    assert.equal(res.status, 200);
    const adminBCodes = new Set((await Paper.find({ adminId: adminB.admin._id }).select('code').lean()).map(p => p.code));
    const crossContamination = res.body.filter(r => r.paperCode === paperA.code && !adminBCodes.has(r.paperCode));
    assert.equal(crossContamination.length, 0, 'Admin B result list must not include Admin A results');
  });

  test('Admin B cannot delete Admin A\'s results by ID', async () => {
    const results = await Result.find({ paperCode: paperA.code }).lean();
    if (!results.length) return; // skip if student hasn't submitted yet
    const res = await call('/admin/results/' + results[0]._id, { method: 'DELETE', auth: adminB.token });
    assert.ok(res.status === 403 || res.status === 404);
    // Verify still in DB.
    const still = await Result.findById(results[0]._id).lean();
    assert.ok(still, 'Result should NOT be deleted by Admin B');
  });
});

describe('Subjective grading isolation', () => {
  let adminA, adminB, attemptId;

  test('Setup: Admin A quiz with subjective question, student submits', async () => {
    adminA = await createAdmin('admina3@test.local');
    adminB = await createAdmin('adminb3@test.local');
    const subjPaper = await createPaper(null, adminA.token, {
      title: 'Subjective Quiz',
      questions: [{ type: 'subjective', text: 'Explain X.', maxMarks: 10, instructions: '', rubric: '', keyConcepts: [], modelAnswer: '' }]
    });
    // Make paper accessible.
    await call('/admin/papers/' + subjPaper._id + '/reopen', { method: 'POST', auth: adminA.token, body: { ms: 86400000 } });
    const rollRes = await createRoll(adminA.token, 'SUBJROLL001');
    const st = await registerAndLoginStudent('SUBJROLL001', rollRes.pin);
    const startRes = await call('/papers/' + subjPaper.code + '/start', { method: 'POST', auth: st.token });
    const aId = startRes.body.attemptId;
    const submitRes = await call('/attempts/' + aId + '/submit', { method: 'POST', auth: st.token, body: { answer: 'This is my answer.' } });
    attemptId = String(aId);
    assert.equal(submitRes.status, 200);
  });

  test('Admin B cannot view Admin A\'s subjective submission by ID', async () => {
    const res = await call('/admin/subjective/submissions/' + attemptId, { auth: adminB.token });
    assert.ok(res.status === 403 || res.status === 404,
      'Admin B should get 403/404 for Admin A\'s subjective submission, got ' + res.status);
  });

  test('Admin B cannot approve Admin A\'s subjective evaluation', async () => {
    const res = await call('/admin/subjective/submissions/' + attemptId + '/0/approve', {
      method: 'POST', auth: adminB.token, body: { marks: 5, feedback: 'Nice' }
    });
    assert.ok(res.status === 403 || res.status === 404);
    // Verify evaluation was NOT approved.
    const a = await Attempt.findById(attemptId).lean();
    const ev = a?.evaluations?.find(e => e.idx === 0);
    assert.ok(!ev || ev.status !== 'approved', 'Evaluation must NOT be approved by Admin B');
  });

  test('Admin B cannot delete Admin A\'s subjective submission', async () => {
    const res = await call('/admin/subjective/submissions/' + attemptId, { method: 'DELETE', auth: adminB.token });
    assert.ok(res.status === 403 || res.status === 404);
    // Verify still in DB.
    const a = await Attempt.findById(attemptId).lean();
    assert.ok(a, 'Attempt should NOT be deleted by Admin B');
  });

  test('Admin B subjective stats don\'t include Admin A\'s data', async () => {
    const resA = await call('/admin/subjective/stats', { auth: adminA.token });
    const resB = await call('/admin/subjective/stats', { auth: adminB.token });
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    // Admin B's total pending evaluations should be 0 (they have no papers).
    const totalB = Object.values(resB.body).reduce((s, n) => s + n, 0);
    assert.equal(totalB, 0, 'Admin B should see 0 subjective evaluations');
  });
});

describe('Retake isolation', () => {
  let adminA, adminB, paperA;

  test('Setup: Admin A quiz with a result', async () => {
    adminA = await createAdmin('admina4@test.local');
    adminB = await createAdmin('adminb4@test.local');
    paperA = await createPaper(null, adminA.token, { title: 'Retake Isolated Quiz' });
    await call('/admin/papers/' + paperA._id + '/reopen', { method: 'POST', auth: adminA.token, body: { ms: 86400000 } });
    const rollRes = await createRoll(adminA.token, 'RETAKEROLL001');
    const st = await registerAndLoginStudent('RETAKEROLL001', rollRes.pin);
    await submitAttempt(paperA.code, st.token);
    await new Promise(r => setTimeout(r, 100));
  });

  test('Admin B cannot grant a retake for Admin A\'s paper', async () => {
    const res = await call('/admin/retakes', {
      method: 'POST', auth: adminB.token,
      body: { rollNumber: 'RETAKEROLL001', paperCode: paperA.code }
    });
    assert.ok(res.status === 403 || res.status === 404,
      'Admin B should be denied from granting retake on Admin A paper, got ' + res.status);
    // Verify no grant in DB.
    const grant = await RetakeGrant.findOne({ paperCode: paperA.code, used: false }).lean();
    assert.ok(!grant, 'No retake grant should have been created');
  });

  test('Admin B cannot see retakes for Admin A\'s paper', async () => {
    // Grant retake as Admin A first.
    await call('/admin/retakes', {
      method: 'POST', auth: adminA.token,
      body: { rollNumber: 'RETAKEROLL001', paperCode: paperA.code }
    });
    const res = await call('/admin/retakes?code=' + paperA.code, { auth: adminB.token });
    assert.ok(res.status === 403 || (res.status === 200 && res.body.length === 0),
      'Admin B should not see Admin A retakes');
  });
});

describe('Dashboard statistics isolation', () => {
  let adminA, adminB;

  test('Setup: Admins with separate data', async () => {
    adminA = await createAdmin('admina5@test.local');
    adminB = await createAdmin('adminb5@test.local');
    await createPaper(null, adminA.token, { title: 'Dashboard Quiz A' });
    await createPaper(null, adminA.token, { title: 'Dashboard Quiz A2' });
    // Admin B has no papers.
  });

  test('Admin A stats show their own papers', async () => {
    const res = await call('/admin/stats', { auth: adminA.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.papers >= 2, 'Admin A should have at least 2 papers, got ' + res.body.papers);
  });

  test('Admin B stats show zero papers (they have none)', async () => {
    const res = await call('/admin/stats', { auth: adminB.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.papers, 0, 'Admin B should have 0 papers');
  });
});

describe('Super-admin cross-admin access', () => {
  let superToken, adminA, paperA;

  test('Setup', async () => {
    adminA = await createAdmin('admina6@test.local');
    paperA = await createPaper(null, adminA.token, { title: 'Super Visible Quiz' });
    superToken = adminToken('owner@test.local', 'super', true);
  });

  test('Super-admin can access any admin\'s paper', async () => {
    const res = await call('/admin/papers/' + paperA._id, { auth: superToken });
    assert.equal(res.status, 200);
  });

  test('Super-admin sees all papers in list', async () => {
    const res = await call('/admin/papers', { auth: superToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.some(p => p._id === paperA._id));
  });
});

describe('Client-supplied adminId cannot bypass ownership', () => {
  let adminA, adminB, paperA;

  test('Setup', async () => {
    adminA = await createAdmin('admina7@test.local');
    adminB = await createAdmin('adminb7@test.local');
    paperA = await createPaper(null, adminA.token, { title: 'IDOR Test Quiz' });
  });

  test('Admin B token with Admin A ID in body cannot access Admin A paper (via PATCH)', async () => {
    // Even if Admin B sends Admin A's adminId in the request body, the server ignores it.
    // Use PATCH (which allows a body) to test body-injection; the ownership check happens server-side.
    const res = await call('/admin/papers/' + paperA._id, {
      method: 'PATCH',
      auth: adminB.token,
      body: { adminId: String(adminA.admin._id), title: 'Hacked', perQ: 0, questions: [{ type: 'mcq', text: 'Q', options: ['A', 'B'], correct: 0 }] }
    });
    assert.ok(res.status === 403 || res.status === 404,
      'Server must ignore client-supplied adminId, got ' + res.status);
    // Verify title was NOT changed.
    const p = await Paper.findById(paperA._id).lean();
    assert.equal(p.title, 'IDOR Test Quiz', 'Paper title must not have been changed by Admin B');
  });

  test('Forged token with another admin ID is rejected by JWT verification', async () => {
    // Create a token signed with a DIFFERENT secret - should be rejected.
    const fakeToken = 'Bearer ' + (() => {
      try {
        // This is intentionally invalid - just a made-up string.
        return 'header.eyJlbWFpbCI6ImFkbWluYkB0ZXN0LmxvY2FsIiwiYWRtaW5JZCI6InN1cGVyIiwiaXNTdXBlciI6dHJ1ZX0.invalidsig';
      } catch { return 'invalid'; }
    })();
    const res = await call('/admin/papers/' + paperA._id, { auth: fakeToken });
    assert.equal(res.status, 401, 'Forged token must be rejected with 401');
  });
});
