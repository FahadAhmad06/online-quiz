import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Student from '../models/Student.js';
import AllowedRollNumber from '../models/AllowedRollNumber.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import normalizeRoll from '../utils/normalizeRoll.js';
import signToken from '../utils/signToken.js';
import makeLimiter from '../middleware/rateLimit.js';

const r = Router();
const LOCK_MS = 15 * 60 * 1000;
const PIN_FAIL_LIMIT = 5, LOGIN_FAIL_LIMIT = 8;

r.post('/register', makeLimiter({ max: 20, message: 'Too many attempts. Please try again later.' }), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const rollNumber = normalizeRoll(req.body?.rollNumber);
  const pin = String(req.body?.pin || '').trim();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!name) throw httpError(400, 'Enter your name.');
  if (!rollNumber) throw httpError(400, 'Enter your roll number.');
  if (!pin) throw httpError(400, 'Enter your registration PIN.');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  if (password !== confirmPassword) throw httpError(400, 'Passwords do not match.');

  const allowed = await AllowedRollNumber.findOne({ rollNumber });
  if (!allowed || !allowed.isEnabled) throw httpError(403, 'This roll number has not been authorized by the admin.');
  if (allowed.isRegistered) throw httpError(409, 'This roll number has already been registered.');
  if (allowed.pinLockedUntil && allowed.pinLockedUntil.getTime() > Date.now()) throw httpError(429, 'Too many attempts. Please try again later.');
  if (!allowed.pinHash) throw httpError(401, 'This registration PIN has expired or has already been used.');

  const ok = await bcrypt.compare(pin, allowed.pinHash);
  if (!ok) {
    allowed.pinFailCount += 1;
    if (allowed.pinFailCount >= PIN_FAIL_LIMIT) { allowed.pinLockedUntil = new Date(Date.now() + LOCK_MS); allowed.pinFailCount = 0; }
    await allowed.save();
    throw httpError(401, 'The registration PIN is invalid.');
  }

  // Atomic claim: only one concurrent request can flip isRegistered false -> true.
  const claim = await AllowedRollNumber.findOneAndUpdate(
    { _id: allowed._id, isRegistered: false },
    { isRegistered: true, pinHash: null, pinFailCount: 0, pinLockedUntil: null }
  );
  if (!claim) throw httpError(409, 'This roll number has already been registered.');

  let student;
  try {
    student = await Student.create({ name, rollNumber, passwordHash: await bcrypt.hash(password, 10) });
  } catch (e) {
    await AllowedRollNumber.updateOne({ _id: allowed._id }, { isRegistered: false }); // roll back the claim
    throw e;
  }
  await AllowedRollNumber.updateOne({ _id: allowed._id }, { registeredStudent: student._id });

  res.status(201).json({ ok: true });
}));

r.post('/login', makeLimiter({ max: 30, message: 'Too many attempts. Please try again later.' }), asyncHandler(async (req, res) => {
  const rollNumber = normalizeRoll(req.body?.rollNumber);
  const password = String(req.body?.password || '');
  const student = await Student.findOne({ rollNumber });

  if (student?.loginLockedUntil && student.loginLockedUntil.getTime() > Date.now()) throw httpError(429, 'Too many attempts. Please try again later.');

  const ok = !!student && await bcrypt.compare(password, student.passwordHash);
  if (!ok) {
    if (student) {
      student.loginFailCount += 1;
      if (student.loginFailCount >= LOGIN_FAIL_LIMIT) { student.loginLockedUntil = new Date(Date.now() + LOCK_MS); student.loginFailCount = 0; }
      await student.save();
    }
    throw httpError(401, 'Wrong roll number or password.');
  }

  student.loginFailCount = 0; student.loginLockedUntil = null; student.sessionVersion += 1;
  await student.save();
  res.json({ token: signToken({ sub: student._id.toString(), roll: student.rollNumber, v: student.sessionVersion }), name: student.name, rollNumber: student.rollNumber });
}));

export default r;
