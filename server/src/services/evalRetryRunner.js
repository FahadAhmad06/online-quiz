import config from '../config.js';
import createRateGate from '../utils/rateGate.js';
import { buildPrompt } from './evalPrompt.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// A single run never sits out a huge provider-requested wait (e.g. a multi-minute daily quota
// reset) - that belongs to providerAvailability.js's cross-run backoff instead. This only bounds
// backoff BETWEEN attempts on the same provider within one run (relevant only if
// AI_MAX_ATTEMPTS_PER_PROVIDER > 1); with the default of 1 attempt it is never used.
const IN_RUN_MAX_WAIT_MS = 65000;

// One provider's call/retry machinery, shared by every provider (geminiEvaluator.js,
// groqEvaluator.js, ...). This module only knows how to attempt ONE provider up to
// AI_MAX_ATTEMPTS_PER_PROVIDER times; it has no idea the other provider exists - that orchestration
// (trying Gemini, falling back to Groq, tracking which one is currently down) lives in
// aiEvaluator.js, which calls attempt() and inspects the thrown error's .kind/.isAuthError/
// .providerRetryDelayMs to decide what to do next.
//
//   providerName - shown in failure messages and stored as evaluation.provider.
//   getModel()   - current model id for this provider, stored as evaluation.model.
//   getClient()  - returns (or lazily builds) the provider's SDK client; throws if unconfigured.
//   callOnce(client, prompt, maxMarks) - one provider API call -> { result, usage }.
//   classify(e)  - 'transient' (worth another call) or 'permanent' (same request fails again).
//   describeFailure(e) - admin-safe message; never the raw error (could echo the request/key back).
//   retryDelayMs(e) - provider-requested wait (e.g. Retry-After), or null.
//   isTimeout(e) - true if e is this call's own timeout.
//   isAuthError(e) - true if e means the configured API key/credentials are bad.
export function createProviderAttempt({ providerName, getModel, getClient, callOnce, classify, describeFailure, retryDelayMs, isTimeout, isAuthError }) {
  const gate = createRateGate(config.evalRpm);

  // Either returns a fully normalized evaluation plus timing metadata, or throws an Error whose
  // message is safe to store/show an admin, with .kind ('transient' | 'permanent'), .meta,
  // .isAuthError and .providerRetryDelayMs (for providerAvailability.js to schedule around).
  async function attempt(input) {
    const meta = { calls: 0, callMs: [], aiMs: 0, rateLimited: 0, timeouts: 0, provider: providerName, model: getModel() };
    let client;
    try { client = getClient(); } catch (e) { throw Object.assign(new Error(e.message), { kind: 'permanent', meta, isAuthError: false, providerRetryDelayMs: null }); }
    const prompt = buildPrompt(input);
    const maxAttempts = config.aiMaxAttemptsPerProvider;
    for (let attemptNum = 1; ; attemptNum++) {
      await gate.wait();
      const t0 = performance.now();
      try {
        meta.calls++;
        const out = await callOnce(client, prompt, input.maxMarks);
        const ms = performance.now() - t0; meta.callMs.push(ms); meta.aiMs += ms;
        return { ...out, meta };
      } catch (e) {
        const ms = performance.now() - t0; meta.callMs.push(ms); meta.aiMs += ms;
        if (e?.status === 429) meta.rateLimited++;
        if (isTimeout(e)) meta.timeouts++;
        const kind = classify(e);
        const providerRetryDelayMs = retryDelayMs(e) ?? null;
        // A provider-requested wait longer than we would ever honor inline (e.g. a multi-minute
        // quota reset) ends this run immediately instead of sleeping through it - that belongs to
        // providerAvailability.js's cross-run backoff. Without this, a single run could block for
        // up to IN_RUN_MAX_WAIT_MS on every attempt before finally giving up.
        const tooLongToHonor = providerRetryDelayMs !== null && providerRetryDelayMs > IN_RUN_MAX_WAIT_MS;
        if (kind === 'permanent' || isTimeout(e) || attemptNum >= maxAttempts || tooLongToHonor) {
          throw Object.assign(new Error(describeFailure(e)), { kind, meta, isAuthError: isAuthError(e), providerRetryDelayMs });
        }
        // Only reached when AI_MAX_ATTEMPTS_PER_PROVIDER > 1: a bounded backoff before trying this
        // same provider again, still within this one run.
        const backoff = config.aiRetryBaseDelayMs * 2 ** (attemptNum - 1);
        const wait = Math.min(Math.max(providerRetryDelayMs ?? 0, backoff) + Math.random() * backoff * 0.5, IN_RUN_MAX_WAIT_MS);
        if (e?.status === 429) gate.pause(wait);
        await sleep(wait);
      }
    }
  }
  return { attempt };
}
