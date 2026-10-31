import { Router } from 'express';
import bcrypt from 'bcryptjs';
import config from '../config.js';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import safeEqual from '../utils/safeEqual.js';
import signToken from '../utils/signToken.js';
import makeLimiter from '../middleware/rateLimit.js';
import displayName from '../utils/displayName.js';

const r = Router();
r.post('/login', makeLimiter({ max: 20, message: 'Too many attempts. Please try again later.' }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase(), password = String(req.body?.password || '');
  let isSuper = false, ok = false, adminId = null, name = '';
  if (email === config.ownerEmail && safeEqual(password, config.ownerPassword)) {
    ok = true; isSuper = true;
    adminId = 'super'; // sentinel: super-admin has no Admin document
  } else if (email !== config.ownerEmail) {
    const a = await Admin.findOne({ email });
    ok = !!a && a.isEnabled && await bcrypt.compare(password, a.passwordHash);
    if (ok) { adminId = String(a._id); name = displayName(a); }
  }
  if (!ok) throw httpError(401, 'Wrong email or password.');
  // `name` baked into the token like email/isSuper already are: it can go stale until next login
  // if the Owner renames this teacher mid-session, same as any other token-carried field here.
  res.json({ token: signToken({ email, isSuper, adminId, name }), email, isSuper, adminId, name });
}));
export default r;
