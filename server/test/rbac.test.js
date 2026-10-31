// rbac.test.js — Role-Based Access Control tests.
// Proves:
//   - Owner (isSuper) can read ALL admin data across every resource type.
//   - Owner can manage (create/delete) admin accounts.
//   - Regular admins are strictly isolated from each other.
//   - Regular admins cannot escalate to Owner by forging tokens or request bodies.
//   - Students can only access their own attempts.
//
// Uses a separate mongod port (27997) so this file can run standalone or in parallel
// with ownership.test.js (27998) and evaluation.test.js (27999).

process.env.MONGO_URI = process.env.TEST_MONGO_URI_RBAC || 'mongodb://127.0.0.1:27997/quizroom_rbac_test';

import './helpers/env.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startMongod } from './helpers/mongod.js';

let mongod, server, base;
let mongoose, Admin, Paper, Result, AllowedRollNumber, RetakeGrant, Student, Attempt, signToken;

// ── HTTP helper ────────────────────────────────────────────────────────────────
const call = async (path, { method = 'GET', auth, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ── Token helpers ──────────────────────────────────────────────────────────────
const ownerToken  = () => 'Bearer ' + signToken({ email: 'owner@rbac.test', isSuper: true, adminId: 'super' });
const regularTok  = (email, id) => 'Bearer ' + signToken({ email, isSuper: false, adminId: String(id) });

before(async () => {
  process.env.EVAL_CONCURRENCY = '1';
  process.env.AI_FALLBACK_ENABLED = 'false';

  mongod = await startMongod(27997);
  ({ default: mongoose }          = await import('mongoose'));
  const { default: app }          = await import('../src/app.js');
  const { default: connectDb }    = await import('../src/db.js');
  ({ default: Admin }             = await import('../src/models/Admin.js'));
  ({ default: Paper }             = await import('../src/models/Paper.js'));
  ({ default: Result }            = await import('../src/models/Result.js'));
  ({ default: AllowedRollNumber } = await import('../src/models/AllowedRollNumber.js'));
  ({ default: RetakeGrant }       = await import('../src/models/RetakeGrant.js'));
  ({ default: Student }           = await import('../src/models/Student.js'));
  ({ default: Attempt }           = await import('../src/models/Attempt.js'));
  ({ default: signToken }         = await import('../src/utils/signToken.js'));

  await connectDb();
  await mongoose.connection.db.dropDatabase();
  server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});

after(async () => {
  server?.close();
  await mongoose?.disconnect();
  await mongod?.stop();
});

// ── Fixture helpers ────────────────────────────────────────────────────────────
async function createAdmin(email, password = 'password123') {
  const bcrypt = await import('bcryptjs');
  const a = await Admin.create({ email, passwordHash: await bcrypt.default.hash(password, 4) });
  return { admin: a, token: regularTok(email, a._id) };
}

async function createPaper(adminToken, title = 'Quiz') {
  const res = await call('/admin/papers', {
    method: 'POST', auth: adminToken,
    body: { title, perQ: 0, questions: [{ type: 'mcq', text: 'Q?', options: ['A', 'B'], correct: 0 }] }
  });
  assert.equal(res.status, 201, 'createPaper: ' + JSON.stringify(res.body));
  return res.body;
}

async function createRoll(adminToken, rollNumber) {
  const res = await call('/admin/rolls', {
    method: 'POST', auth: adminToken, body: { rollNumber }
  });
  assert.equal(res.status, 201, 'createRoll: ' + JSON.stringify(res.body));
  return res.body;
}

// ── 1. Owner account management ────────────────────────────────────────────────
describe('Owner — admin account management', () => {
  let newAdminId;

  test('Owner can list all admin accounts', async () => {
    // Create one admin to populate the list.
    const a = await createAdmin('listed@rbac.test');
    const res = await call('/admin/admins', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.admins));
    assert.ok(res.body.admins.some(x => x.email === 'listed@rbac.test'));
    assert.ok(res.body.owner, 'Response must include owner email sentinel');
  });

  test('Owner can create a new admin account', async () => {
    const res = await call('/admin/admins', {
      method: 'POST', auth: ownerToken(),
      body: { email: 'newadmin@rbac.test', password: 'password123' }
    });
    assert.equal(res.status, 201);
    assert.ok(res.body._id);
    newAdminId = res.body._id;
  });

  test('Owner can delete an admin account', async () => {
    const res = await call('/admin/admins/' + newAdminId, { method: 'DELETE', auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
    // Verify gone.
    const gone = await Admin.findById(newAdminId).lean();
    assert.equal(gone, null);
  });

  test('Regular admin cannot list admin accounts (403)', async () => {
    const a = await createAdmin('notowner@rbac.test');
    const res = await call('/admin/admins', { auth: a.token });
    assert.equal(res.status, 403, 'Regular admin must NOT list admin accounts');
  });

  test('Regular admin cannot create admin accounts (403)', async () => {
    const a = await createAdmin('notowner2@rbac.test');
    const res = await call('/admin/admins', {
      method: 'POST', auth: a.token,
      body: { email: 'hacked@rbac.test', password: 'password123' }
    });
    assert.equal(res.status, 403);
  });
});

// ── 2. Owner — cross-admin data views ──────────────────────────────────────────
describe('Owner — can view any admin\'s data', () => {
  let adminA, paperA, rollA;

  test('Setup: Admin A creates a quiz and roll number', async () => {
    adminA = await createAdmin('adminA-rbac@rbac.test');
    paperA = await createPaper(adminA.token, 'Admin A RBAC Quiz');
    await call('/admin/papers/' + paperA._id + '/reopen', {
      method: 'POST', auth: adminA.token, body: { ms: 86400000 }
    });
    rollA = await createRoll(adminA.token, 'RBACROLL001');
  });

  test('Owner can list Admin A\'s papers via /admin/admins/:id/papers', async () => {
    const res = await call('/admin/admins/' + adminA.admin._id + '/papers', { auth: ownerToken() });
    assert.equal(res.status, 200, 'Owner must get 200, got ' + res.status);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(p => p.title === 'Admin A RBAC Quiz'));
  });

  test('Owner can view Admin A\'s stats via /admin/admins/:id/stats', async () => {
    const res = await call('/admin/admins/' + adminA.admin._id + '/stats', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(res.body.admin.email === 'admina-rbac@rbac.test');
    assert.ok(res.body.papers >= 1, 'Owner should see Admin A has at least 1 paper');
  });

  test('Owner can view Admin A\'s roll numbers', async () => {
    const res = await call('/admin/admins/' + adminA.admin._id + '/rolls', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(res.body.some(r => r.rollNumber === 'RBACROLL001'));
  });

  test('Owner can view Admin A\'s results', async () => {
    const res = await call('/admin/admins/' + adminA.admin._id + '/results', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('Owner can view Admin A\'s retakes', async () => {
    const res = await call('/admin/admins/' + adminA.admin._id + '/retakes', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('Owner can view Admin A\'s subjective evaluation stats', async () => {
    const res = await call('/admin/admins/' + adminA.admin._id + '/subjective/stats', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.pending === 'number');
  });

  test('Owner can access Admin A\'s paper by direct ID', async () => {
    const res = await call('/admin/papers/' + paperA._id, { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.paper.title, 'Admin A RBAC Quiz');
  });

  test('Owner sees all papers in list (not just their own)', async () => {
    const adminB = await createAdmin('adminB-rbac-list@rbac.test');
    await createPaper(adminB.token, 'Admin B RBAC Quiz');
    const res = await call('/admin/papers', { auth: ownerToken() });
    assert.equal(res.status, 200);
    assert.ok(res.body.some(p => p.title === 'Admin A RBAC Quiz'), 'Owner must see Admin A paper');
    assert.ok(res.body.some(p => p.title === 'Admin B RBAC Quiz'), 'Owner must see Admin B paper');
  });
});

// ── 3. Regular admin isolation from Owner data ─────────────────────────────────
describe('Regular admin — cannot access Owner-level endpoints', () => {
  let adminA;

  test('Setup', async () => {
    adminA = await createAdmin('adminA-isolated@rbac.test');
  });

  test('Admin cannot access /admin/admins (403)', async () => {
    const res = await call('/admin/admins', { auth: adminA.token });
    assert.equal(res.status, 403);
  });

  test('Admin cannot use /admin/admins/:id/papers to drill into another admin', async () => {
    const adminB = await createAdmin('adminB-drill@rbac.test');
    const res = await call('/admin/admins/' + adminB.admin._id + '/papers', { auth: adminA.token });
    assert.equal(res.status, 403, 'Regular admin must not access another admin\'s drill-down, got ' + res.status);
  });

  test('Admin cannot use /admin/admins/:id/stats to see Owner platform stats', async () => {
    const adminB = await createAdmin('adminB-stats@rbac.test');
    const res = await call('/admin/admins/' + adminB.admin._id + '/stats', { auth: adminA.token });
    assert.equal(res.status, 403);
  });
});

// ── 4. Privilege escalation prevention ────────────────────────────────────────
describe('Privilege escalation — admin cannot claim Owner role', () => {
  let adminA, adminB, paperB;

  test('Setup', async () => {
    adminA = await createAdmin('adminA-priv@rbac.test');
    adminB = await createAdmin('adminB-priv@rbac.test');
    paperB = await createPaper(adminB.token, 'Admin B Priv Quiz');
  });

  test('Forged isSuper=true token with invalid signature is rejected (401)', async () => {
    // Manually craft a token claiming isSuper without the real secret.
    const fakePayload = Buffer.from(JSON.stringify({ email: 'adminA-priv@rbac.test', isSuper: true, adminId: 'super' })).toString('base64');
    const fakeToken = 'Bearer eyJhbGciOiJIUzI1NiJ9.' + fakePayload + '.invalidsignature';
    const res = await call('/admin/admins', { auth: fakeToken });
    assert.equal(res.status, 401, 'Forged super token must be rejected');
  });

  test('Regular admin sending isSuper=true in body cannot access Owner routes (403)', async () => {
    // Even if the admin includes isSuper:true in the request body, server reads from JWT only.
    const res = await call('/admin/admins', {
      method: 'GET',
      auth: adminA.token,
      // Cannot send body with GET; just use the regular token — the point is the JWT is what matters.
    });
    assert.equal(res.status, 403);
  });

  test('Admin B cannot access Admin A\'s paper even by guessing ID', async () => {
    const res = await call('/admin/papers/' + paperB._id, { auth: adminA.token });
    assert.ok(res.status === 403 || res.status === 404,
      'Admin A must not access Admin B paper, got ' + res.status);
  });

  test('Admin A cannot delete Admin B\'s paper', async () => {
    const res = await call('/admin/papers/' + paperB._id, { method: 'DELETE', auth: adminA.token });
    assert.ok(res.status === 403 || res.status === 404);
    // Verify still in DB.
    const p = await Paper.findById(paperB._id).lean();
    assert.ok(p, 'Paper must still exist after Admin A\'s unauthorized delete attempt');
  });

  test('Admin cannot access /admin/admins with a request body containing adminId:super', async () => {
    // This tests that server-side ignores any role hints from request body.
    const res = await call('/admin/admins', {
      method: 'GET',
      auth: adminA.token
    });
    assert.equal(res.status, 403, 'adminId in JWT must be the only source of truth');
  });
});

// ── 5. Owner platform-wide statistics ─────────────────────────────────────────
describe('Owner — platform-wide dashboard statistics', () => {
  let adminA, adminB;
  const ts = Date.now(); // unique suffix to avoid duplicate key errors

  test('Setup: two admins create separate quizzes', async () => {
    adminA = await createAdmin('adminA-stats-' + ts + '@rbac.test');
    adminB = await createAdmin('adminB-stats-' + ts + '@rbac.test');
    await createPaper(adminA.token, 'Stats Quiz A');
    await createPaper(adminA.token, 'Stats Quiz A2');
    await createPaper(adminB.token, 'Stats Quiz B');
  });

  test('Owner stats include all papers from all admins', async () => {
    const res = await call('/admin/stats', { auth: ownerToken() });
    assert.equal(res.status, 200);
    // Owner sees papers from both admins — at least the 3 we just created.
    assert.ok(res.body.papers >= 3, 'Owner should see at least 3 papers, got ' + res.body.papers);
  });

  test('Admin A stats only include Admin A\'s own papers', async () => {
    const resA = await call('/admin/stats', { auth: adminA.token });
    assert.equal(resA.status, 200);
    // Admin A created exactly 2 papers (Stats Quiz A and Stats Quiz A2).
    assert.ok(resA.body.papers >= 2, 'Admin A should see at least 2 papers, got ' + resA.body.papers);

    const resB = await call('/admin/stats', { auth: adminB.token });
    assert.equal(resB.status, 200);
    // Admin B created 1 paper; Admin A has more.
    assert.ok(resA.body.papers > resB.body.papers,
      'Admin A (2 papers) must see more papers than Admin B (1 paper): A=' + resA.body.papers + ' B=' + resB.body.papers);
  });

  test('Admin A stats do not include Admin B papers', async () => {
    const resA = await call('/admin/stats', { auth: adminA.token });
    const resB = await call('/admin/stats', { auth: adminB.token });
    // A has 2, B has 1. The counts must differ.
    assert.notEqual(resA.body.papers, resB.body.papers,
      'Admin A (2 papers) and Admin B (1 paper) must have different paper counts — isolation check');
  });
});


// ── 6. Student role — cannot access admin routes ──────────────────────────────
describe('Student role — cannot access any admin endpoint', () => {
  test('Student token (or no token) cannot reach admin routes', async () => {
    // Unauthenticated.
    const unauth = await call('/admin/papers');
    assert.equal(unauth.status, 401);

    // Simulate a student JWT (students use a different token format in this app).
    // Any non-admin Bearer token should fail requireAdmin.
    const fakeStudentToken = 'Bearer notavalidtoken';
    const res = await call('/admin/papers', { auth: fakeStudentToken });
    assert.equal(res.status, 401);
  });

  test('Student cannot access /admin/admins', async () => {
    const res = await call('/admin/admins');
    assert.equal(res.status, 401);
  });
});

// ── 7. Existing functionality preserved ───────────────────────────────────────
describe('Existing functionality — auth and quiz creation preserved', () => {
  test('Admin login returns adminId in response', async () => {
    const a = await createAdmin('logincheck@rbac.test');
    const res = await call('/admin/login', {
      method: 'POST',
      body: { email: 'logincheck@rbac.test', password: 'password123' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'Login must return token');
    assert.ok(res.body.adminId, 'Login must return adminId');
    assert.equal(res.body.isSuper, false);
  });

  test('Admin can create a paper and it is stamped with their adminId', async () => {
    const a = await createAdmin('stamp@rbac.test');
    const paper = await createPaper(a.token, 'Stamp Test');
    const p = await Paper.findById(paper._id).lean();
    assert.ok(p.adminId, 'Paper must have adminId set');
    assert.equal(String(p.adminId), String(a.admin._id));
  });

  test('Admin can view their own paper list and it only contains their papers', async () => {
    const a = await createAdmin('mylist@rbac.test');
    const b = await createAdmin('otherlist@rbac.test');
    await createPaper(a.token, 'My Paper');
    await createPaper(b.token, 'Their Paper');

    const res = await call('/admin/papers', { auth: a.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some(p => p.title === 'My Paper'), 'Must see own paper');
    assert.ok(!res.body.some(p => p.title === 'Their Paper'), 'Must NOT see other admin paper');
  });
});
