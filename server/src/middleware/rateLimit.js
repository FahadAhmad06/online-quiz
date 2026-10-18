import rateLimit from 'express-rate-limit';
// IP-based outer throttle. Per-identity lockout (PIN / password) is handled separately in the
// route handlers so a shared classroom network doesn't lock everyone out at once.
export default function makeLimiter({ windowMs = 15 * 60 * 1000, max = 20, message } = {}) {
  return rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    message: { error: message || 'Too many attempts. Please try again later.' }
  });
}
