import { Router } from 'express';
import Result from '../models/Result.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import rankResults from '../utils/rankResults.js';

const r = Router();
// Ranks are always computed per paper over all of that paper's results.
r.get('/results', asyncHandler(async (req, res) => {
  const f = req.query.paper ? { paperCode: String(req.query.paper).toUpperCase() } : {};
  res.json(rankResults(await Result.find(f).lean()));
}));
r.delete('/results/:id', asyncHandler(async (req, res) => {
  const d = await Result.deleteOne({ _id: req.params.id });
  if (!d.deletedCount) throw httpError(404, 'Result not found');
  res.json({ ok: true });
}));
export default r;
