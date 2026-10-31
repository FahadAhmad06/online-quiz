import config from '../config.js';

// Tracks each AI provider's health independently (process-local, same in-memory model already used
// for rate gating/metrics elsewhere in this app). This is what lets the orchestrator (aiEvaluator.js)
// skip a provider it already knows is down without spending a call to rediscover that, and lets a
// provider recover automatically once its own backoff window passes - no polling, no timers: the
// next evaluation attempt (from the normal submit/sweep/retry flow) just checks the clock.
//
// States: 'available' (default) | 'rate_limited' | 'quota_exhausted' | 'unavailable' | 'config_error'.
// config_error never auto-clears (a bad API key does not fix itself) - only clearConfigErrors()
// (what an admin's explicit re-evaluate does) lifts it.
const QUOTA_THRESHOLD_MS = 65000; // a provider-requested wait at least this long reads as "quota", not just "rate limited"

function makeEntry() { return { state: 'available', retryAt: null, failureStreak: 0 }; }
const providers = { gemini: makeEntry(), groq: makeEntry() };

const jitter = ms => ms + Math.random() * ms * 0.2;

function stateFor(err) {
  if (err?.isAuthError) return 'config_error';
  if ((err?.providerRetryDelayMs ?? 0) >= QUOTA_THRESHOLD_MS) return 'quota_exhausted';
  if (err?.meta?.rateLimited) return 'rate_limited';
  return 'unavailable';
}

// provider: 'gemini' | 'groq'. err: the classified Error thrown by that provider's attempt, with
// .isAuthError and .providerRetryDelayMs (that provider's own Retry-After, if any) set.
export function recordFailure(provider, err) {
  const e = providers[provider];
  if (!e) return;
  const state = stateFor(err);
  if (state === 'config_error') { e.state = state; e.retryAt = null; return; } // sticky until cleared
  e.failureStreak++;
  const backoff = config.aiRetryBaseDelayMs * 2 ** (e.failureStreak - 1);
  const wait = Math.min(Math.max(err?.providerRetryDelayMs ?? 0, backoff), config.aiRetryMaxDelayMs);
  e.state = state;
  e.retryAt = new Date(Date.now() + jitter(wait));
}

export function recordSuccess(provider) {
  const e = providers[provider];
  if (!e) return;
  e.state = 'available'; e.retryAt = null; e.failureStreak = 0;
}

export function isAvailable(provider) {
  const e = providers[provider];
  if (!e) return false;
  return e.state === 'available' || (e.retryAt !== null && Date.now() >= e.retryAt.getTime());
}

// What to tell the admin/student when a provider is currently being skipped.
export function status(provider) {
  const e = providers[provider];
  if (!e) return null;
  const effectivelyAvailable = isAvailable(provider);
  return { state: effectivelyAvailable ? 'available' : e.state, retryAt: effectivelyAvailable ? null : e.retryAt, failureStreak: e.failureStreak };
}

export function snapshot() { return Object.fromEntries(Object.keys(providers).map(p => [p, status(p)])); }

// An admin's explicit re-evaluate always gets a real attempt at every configured provider, the
// same way a single-provider re-evaluate used to clear that provider's quota block.
export function clearAll() { for (const p of Object.keys(providers)) recordSuccess(p); }
