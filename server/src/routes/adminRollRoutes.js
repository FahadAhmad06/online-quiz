import { Router } from 'express';
import bcrypt from 'bcryptjs';
import AllowedRollNumber from '../models/AllowedRollNumber.js';
import Student from '../models/Student.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import normalizeRoll from '../utils/normalizeRoll.js';
import generatePin from '../utils/generatePin.js';

const r = Router(); // mounted behind requireAdmin

const view = a => ({
  _id: a._id, rollNumber: a.rollNumber, isEnabled: a.isEnabled, isRegistered: a.isRegistered,
  registeredStudent: a.registeredStudent, createdAt: a.createdAt
});

r.get('/rolls', asyncHandler(async (req, res) => {
  const rows = await AllowedRollNumber.find().select('-pinHash -pinFailCount -pinLockedUntil')
    .populate('registeredStudent', 'name rollNumber').sort({ createdAt: -1 }).lean();
  res.json(rows.map(view));
}));

r.post('/rolls', asyncHandler(async (req, res) => {
  const rollNumber = normalizeRoll(req.body?.rollNumber);
  if (!rollNumber) throw httpError(400, 'Enter a roll number.');
  if (await AllowedRollNumber.exists({ rollNumber })) throw httpError(409, 'This roll number is already on the list.');
  const pin = String(req.body?.pin || '').trim() || generatePin();
  if (pin.length < 6) throw httpError(400, 'PIN must be at least 6 characters.');
  const a = await AllowedRollNumber.create({ rollNumber, pinHash: await bcrypt.hash(pin, 10), createdBy: req.admin.email });
  res.status(201).json({ ...view(a), pin });
}));

r.post('/rolls/bulk', asyncHandler(async (req, res) => {
  const lines = String(req.body?.rollNumbers || '').split(/[\n,]/).map(normalizeRoll).filter(Boolean);
  const unique = [...new Set(lines)];
  if (!unique.length) throw httpError(400, 'Enter at least one roll number.');
  const existing = new Set((await AllowedRollNumber.find({ rollNumber: { $in: unique } }).select('rollNumber').lean()).map(x => x.rollNumber));
  const created = [];
  for (const rollNumber of unique) {
    if (existing.has(rollNumber)) continue;
    const pin = generatePin();
    await AllowedRollNumber.create({ rollNumber, pinHash: await bcrypt.hash(pin, 10), createdBy: req.admin.email });
    created.push({ rollNumber, pin });
  }
  res.status(201).json({ created, skipped: unique.filter(r => existing.has(r)) });
}));

r.post('/rolls/:id/regenerate', asyncHandler(async (req, res) => {
  const a = await AllowedRollNumber.findById(req.params.id);
  if (!a) throw httpError(404, 'Roll number not found.');
  if (a.isRegistered) throw httpError(400, 'This roll number is already registered.');
  const pin = generatePin();
  a.pinHash = await bcrypt.hash(pin, 10); a.pinFailCount = 0; a.pinLockedUntil = null;
  await a.save();
  res.json({ ...view(a), pin });
}));

r.post('/rolls/:id/disable', asyncHandler(async (req, res) => {
  const a = await AllowedRollNumber.findByIdAndUpdate(req.params.id, { isEnabled: false }, { new: true });
  if (!a) throw httpError(404, 'Roll number not found.');
  res.json(view(a));
}));

r.post('/rolls/:id/enable', asyncHandler(async (req, res) => {
  const a = await AllowedRollNumber.findByIdAndUpdate(req.params.id, { isEnabled: true }, { new: true });
  if (!a) throw httpError(404, 'Roll number not found.');
  res.json(view(a));
}));

// Removes the allowlist entry; if a student has registered on it, deletes that student's
// account too (their past attempts/results are untouched). The roll number can be re-added fresh.
r.delete('/rolls/:id', asyncHandler(async (req, res) => {
  const a = await AllowedRollNumber.findById(req.params.id);
  if (!a) throw httpError(404, 'Roll number not found.');
  if (a.isRegistered && a.registeredStudent) await Student.deleteOne({ _id: a.registeredStudent });
  await a.deleteOne();
  res.json({ ok: true });
}));

export default r;
