import app from './app.js';
import config from './config.js';
import connectDb from './db.js';
import { processPending } from './services/subjectiveEvaluation.js';

// Long-running server only (the Vercel entry in api/ has no timers): periodically grades anything
// the post-submit kick missed, recovers runs that died with a restart once their lease expires,
// and retries transient failures. Never overlaps itself.
function startSweep() {
  if (!config.evalSweepMs) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await processPending(); } catch (e) { console.error('Evaluation sweep failed:', e.message); }
    busy = false;
  };
  setInterval(tick, config.evalSweepMs).unref();
  tick();
}

connectDb()
  .then(() => app.listen(config.port, () => { console.log('QuizRoom API on http://localhost:' + config.port); startSweep(); }))
  .catch(e => { console.error('Could not start:', e.message); process.exit(1); });
