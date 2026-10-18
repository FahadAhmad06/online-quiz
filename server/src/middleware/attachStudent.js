import jwt from 'jsonwebtoken';
import config from '../config.js';
import Student from '../models/Student.js';
// Lenient: sets req.student when the bearer token is valid and still current, otherwise just
// moves on (never rejects by itself — attempt routes also serve student-less admin previews).
export default async function attachStudent(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const payload = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', config.jwtSecret);
    if (payload.sub) {
      const student = await Student.findById(payload.sub).select('name rollNumber sessionVersion');
      if (student && student.sessionVersion === payload.v) req.student = student;
    }
  } catch { /* no/invalid token: req.student stays unset */ }
  next();
}
