export default function requireOwner(req, res, next) {
  if (!req.admin?.isSuper) return res.status(403).json({ error: 'Only the owner can do this.' });
  next();
}
