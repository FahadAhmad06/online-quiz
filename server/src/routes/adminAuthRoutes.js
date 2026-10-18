import { Router } from 'express';
import bcrypt from 'bcryptjs';
import config from '../config.js';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import safeEqual from '../utils/safeEqual.js';
import signToken from '../utils/signToken.js';
import makeLimiter from '../middleware/rateLimit.js';

const r = Router();
r.post('/login', makeLimiter({ max: 20, message: 'Too many attempts. Please try again later.' }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase(), password = String(req.body?.password || '');
  let isSuper = false, ok = false;
  if (email === config.ownerEmail && safeEqual(password, config.ownerPassword)) { ok = true; isSuper = true; }
  else if (email !== config.ownerEmail) {
    const a = await Admin.findOne({ email });
    ok = !!a && await bcrypt.compare(password, a.passwordHash);
  }
  if (!ok) throw httpError(401, 'Wrong email or password.');
  res.json({ token: signToken({ email, isSuper }), email, isSuper });
}));
export default r;
