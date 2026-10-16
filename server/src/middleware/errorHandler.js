export default function errorHandler(err, req, res, next) {
  if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
  if (err.code === 11000) return res.status(409).json({ error: 'That already exists.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error. Please try again.' : err.message });
}
