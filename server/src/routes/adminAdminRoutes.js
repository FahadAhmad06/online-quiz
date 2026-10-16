import { Router } from 'express';
import bcrypt from 'bcryptjs';
import config from '../config.js';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import validEmail from '../utils/validEmail.js';

const r = Router(); // mounted behind requireAdmin + requireOwner
r.get('/', asyncHandler(async (req, res) => {
  res.json({ owner: config.ownerEmail, admins: await Admin.find().select('email createdAt').sort({ createdAt: 1 }).lean() });
}));
r.post('/', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase(), password = String(req.body?.password || '');
  if (!validEmail(email)) throw httpError(400, 'Enter a valid email address.');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  if (email === config.ownerEmail || await Admin.exists({ email })) throw httpError(409, 'That email is already an admin.');
  const a = await Admin.create({ email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ _id: a._id, email: a.email });
}));
r.delete('/:id', asyncHandler(async (req, res) => {
  const d = await Admin.deleteOne({ _id: req.params.id });
  if (!d.deletedCount) throw httpError(404, 'Admin not found');
  res.json({ ok: true });
}));
export default r;
