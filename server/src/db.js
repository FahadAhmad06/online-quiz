import mongoose from 'mongoose';
import config from './config.js';
// Cached on `global` so a warm serverless invocation reuses the same connection instead of
// opening a new one on every request (a plain top-level variable would still work for this
// process, but `global` is the standard-enough pattern and survives module re-evaluation too).
export default function connectDb() {
  if (!global._qrDbPromise) global._qrDbPromise = mongoose.connect(config.mongoUri).then(m => { console.log('MongoDB connected'); return m; });
  return global._qrDbPromise;
}
