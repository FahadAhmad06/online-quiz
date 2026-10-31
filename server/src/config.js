import 'dotenv/config';
const need = k => { if (!process.env[k]) throw new Error('Missing environment variable: ' + k); return process.env[k]; };
const int = (k, d, min = 0) => { const n = Number(process.env[k]); return Number.isFinite(n) && n >= min ? Math.floor(n) : d; };
const bool = (k, d) => { const v = (process.env[k] || '').trim().toLowerCase(); return v === '' ? d : v === 'true' || v === '1'; };
const KNOWN_PROVIDERS = ['gemini', 'groq'];

const aiPrimaryProvider = (process.env.AI_PRIMARY_PROVIDER || 'gemini').trim().toLowerCase();

export default {
  port: process.env.PORT || 5000,
  mongoUri: need('MONGO_URI'),
  jwtSecret: need('JWT_SECRET'),
  ownerEmail: need('OWNER_EMAIL').trim().toLowerCase(),
  ownerPassword: need('OWNER_PASSWORD'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Subjective-answer grading: Gemini is tried first; if it is temporarily unavailable (quota,
  // rate limit, 5xx, timeout, network error, or unusable output) and AI_FALLBACK_ENABLED is true,
  // Groq is tried next. Neither provider is ever retried for an auth/config error - that always
  // needs an admin to fix the key, so it is surfaced instead of silently shifting all load over.
  aiPrimaryProvider,
  aiFallbackProvider: KNOWN_PROVIDERS.find(p => p !== aiPrimaryProvider) || 'groq',
  aiFallbackEnabled: bool('AI_FALLBACK_ENABLED', true),
  // Per-call timeout for either provider.
  aiTimeoutMs: int('AI_TIMEOUT_MS', 30000, 1000),
  // Attempts on ONE provider (with backoff between them) before moving to the other provider -
  // keep this low (default 1 = no in-provider retry) so a struggling provider is failed over away
  // from quickly instead of spending the student's wait time retrying it.
  aiMaxAttemptsPerProvider: int('AI_MAX_ATTEMPTS_PER_PROVIDER', 1, 1),
  // Backoff for how long a provider that just failed is skipped for (future runs/sweeps check
  // again after this), honoring the provider's own Retry-After when it gives one. Doubles per
  // consecutive failure, capped at aiRetryMaxDelayMs.
  aiRetryBaseDelayMs: int('AI_RETRY_BASE_DELAY_MS', 5000),
  aiRetryMaxDelayMs: int('AI_RETRY_MAX_DELAY_MS', 300000),

  // Optional: the server must still start without it. Missing it just means that provider is
  // never available and the other one (if configured) is used instead.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  // Optional MINIMAL/LOW/MEDIUM/HIGH. Unset = the model's own default (unchanged behaviour).
  geminiThinkingLevel: (process.env.GEMINI_THINKING_LEVEL || '').trim().toUpperCase(),
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',

  // Max AI grading calls in flight per server process, across all submissions and both providers.
  evalConcurrency: int('EVAL_CONCURRENCY', 4, 1),
  // Max calls started per minute per provider (match each key's RPM quota); 0 = no pacing.
  evalRpm: int('EVAL_RPM', 0),
  evalMaxRuns: int('EVAL_MAX_RUNS', 3, 1),           // automatic + student-requested runs before only an admin can retry
  evalSweepMs: int('EVAL_SWEEP_INTERVAL_MS', 60000)  // long-running server only; 0 disables
};
