import jwt from 'jsonwebtoken';
import config from '../config.js';
import Admin from '../models/Admin.js';
export default async function requireAdmin(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const payload = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', config.jwtSecret);
    if (!payload.isSuper && !(await Admin.exists({ email: payload.email }))) throw new Error('admin removed');
    req.admin = payload; next();
  } catch { res.status(401).json({ error: 'Please log in again.' }); }
}
