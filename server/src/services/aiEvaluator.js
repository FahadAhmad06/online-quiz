import config from '../config.js';
import geminiAttempt from './geminiEvaluator.js';
import groqAttempt from './groqEvaluator.js';
import * as availability from './providerAvailability.js';

// Two-way orchestrator: subjectiveEvaluation.js (and the admin routes) only ever call this -
// neither knows which provider actually graded an answer. Gemini (the primary) is tried first;
// if it is currently down for a transient reason (quota/rate-limit/5xx/timeout/network/unusable
// output) and AI_FALLBACK_ENABLED is true, Groq is tried next. A provider already known to be down
// (providerAvailability.js) is skipped without spending a call. Neither provider is ever retried
// past a permanent/auth/config error within the SAME run, and a run never visits more than one
// provider more than once - so there is no possibility of an infinite Gemini<->Groq loop; a run
// is bounded by (number of configured providers) x AI_MAX_ATTEMPTS_PER_PROVIDER calls.
const PROVIDERS = { gemini: geminiAttempt, groq: groqAttempt };
const DISPLAY = { gemini: 'Gemini', groq: 'Groq' };
const REASON_TEXT = { quota_exhausted: 'quota exhausted', rate_limited: 'rate limited', unavailable: 'temporarily unavailable', config_error: 'not correctly configured (check its API key)' };

function order() {
  const providers = [config.aiPrimaryProvider];
  if (config.aiFallbackEnabled && config.aiFallbackProvider !== config.aiPrimaryProvider) providers.push(config.aiFallbackProvider);
  return providers.filter(p => PROVIDERS[p]);
}

function describeCombined(tried) {
  return tried.map(t => DISPLAY[t.provider] + ': ' + t.errMessage).join(' ');
}

export default async function evaluateAnswer(input) {
  const providers = order();
  if (!providers.length) {
    throw Object.assign(new Error('No AI provider is configured (check AI_PRIMARY_PROVIDER="' + config.aiPrimaryProvider + '").'), { kind: 'permanent', meta: { calls: 0 } });
  }
  const tried = [];
  for (const provider of providers) {
    if (!availability.isAvailable(provider)) {
      const st = availability.status(provider);
      tried.push({ provider, hardStop: st.state === 'config_error', state: st.state, retryAt: st.retryAt, calls: 0, errMessage: DISPLAY[provider] + ' is ' + (REASON_TEXT[st.state] || 'unavailable') + '.' });
      continue; // never spend a call confirming a provider we already know is down
    }
    try {
      const out = await PROVIDERS[provider](input);
      availability.recordSuccess(provider);
      return { ...out, meta: { ...out.meta, fallbackUsed: tried.length > 0, providersAttempted: [...tried.map(t => t.provider), provider] } };
    } catch (e) {
      availability.recordFailure(provider, e);
      const st = availability.status(provider);
      tried.push({ provider, hardStop: e.kind === 'permanent', state: st.state, retryAt: st.retryAt, calls: e.meta?.calls || 0, subMeta: e.meta, errMessage: e.message });
      if (e.kind === 'permanent') break; // never switch providers for an auth/config/permanent error
    }
  }
  // Aggregate every attempted provider's own metadata (timings, rate-limit/timeout counts) so a
  // failed run still reports them accurately - not just the call count - to evalMetrics.js.
  const meta = {
    calls: tried.reduce((s, t) => s + t.calls, 0),
    aiMs: tried.reduce((s, t) => s + (t.subMeta?.aiMs || 0), 0),
    callMs: tried.flatMap(t => t.subMeta?.callMs || []),
    rateLimited: tried.reduce((s, t) => s + (t.subMeta?.rateLimited || 0), 0),
    timeouts: tried.reduce((s, t) => s + (t.subMeta?.timeouts || 0), 0),
    provider: null, model: null, providersAttempted: tried.map(t => t.provider), fallbackUsed: tried.length > 1
  };
  const message = describeCombined(tried);
  if (tried.every(t => t.hardStop)) throw Object.assign(new Error(message), { kind: 'permanent', meta });
  const live = tried.filter(t => !t.hardStop);
  const candidates = live.filter(t => t.retryAt).map(t => t.retryAt.getTime());
  // Only a genuine provider-side quota exhaustion says nothing about THIS answer (it will grade
  // fine once the quota resets) - an ordinary 5xx/timeout/unusable-output failure still counts
  // against the answer's own EVAL_MAX_RUNS budget, same as before providers could fall back to
  // each other, so a persistently bad answer/provider pairing still stops retrying automatically.
  const quotaOnly = live.length > 0 && live.every(t => t.state === 'quota_exhausted');
  throw Object.assign(new Error(message), {
    kind: 'transient', meta,
    retryAfter: candidates.length ? new Date(Math.min(...candidates)) : null,
    quotaOnly
  });
}

// What an admin's explicit re-evaluate does: every configured provider gets a clean slate,
// including a config_error that would otherwise never clear on its own.
export function clearQuotaBlock() { availability.clearAll(); }

// For the admin metrics panel: current state of both providers (e.g. "Gemini: rate limited,
// retrying after 10:32:05"), never anything provider-internal like the key itself.
export function providerSnapshot() { return availability.snapshot(); }
