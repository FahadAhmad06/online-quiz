import Groq, { APIConnectionTimeoutError } from 'groq-sdk';
import config from '../config.js';
import { SYSTEM, normalize, INVALID, NO_MARKS } from './evalPrompt.js';
import { createProviderAttempt } from './evalRetryRunner.js';

// Groq's own retry/backoff is disabled per call (maxRetries: 0 below) - evalRetryRunner.js already
// retries transient failures under AI_MAX_ATTEMPTS_PER_PROVIDER, the same as every provider.
const jsonSchema = {
  name: 'subjective_grading',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      suggestedMarks: { type: 'number', description: 'Marks awarded, from 0 to maxMarks.' },
      feedback: { type: 'string', description: 'Question-specific feedback for the student, written for after admin approval.' },
      strengths: { type: 'array', items: { type: 'string' }, description: 'Correct concepts the answer got right.' },
      missingConcepts: { type: 'array', items: { type: 'string' }, description: 'Expected concepts the answer missed or left incomplete.' },
      mistakes: { type: 'array', items: { type: 'string' }, description: 'Factual or technical errors, if any.' },
      reasoningSummary: { type: 'string', description: 'Short, student-appropriate explanation of how the marks were determined. No hidden chain-of-thought.' },
      needsManualReview: { type: 'boolean', description: 'True if the question/rubric is ambiguous, the answer is unusual, or you are not confident grading it.' }
    },
    required: ['suggestedMarks', 'feedback', 'strengths', 'missingConcepts', 'mistakes', 'reasoningSummary', 'needsManualReview'],
    additionalProperties: false
  }
};

let client = null;
function getClient() {
  if (!config.groqApiKey) throw new Error('AI grading is not configured (GROQ_API_KEY missing).');
  if (!client) client = new Groq({ apiKey: config.groqApiKey });
  return client;
}

const isTimeout = e => e instanceof APIConnectionTimeoutError;
const isAuthError = e => e?.status === 401 || e?.status === 403;

// transient = worth another call (rate limit, 5xx, timeout, network blip, malformed output);
// permanent = the same request will fail again (bad key, unknown model, bad request).
function classify(e) {
  const status = e?.status;
  if (status === 429) return 'transient';
  if (status === 408 || status >= 500) return 'transient';
  if (status >= 400) return 'permanent';
  if (isTimeout(e) || e?.message === INVALID || e?.message === NO_MARKS) return 'transient';
  if (status === undefined) return 'transient'; // APIConnectionError: DNS/connection reset, no response at all
  return 'permanent';
}

// Turns an SDK error into a clear, admin-safe message - never the raw error object, which could
// otherwise echo the request (and the API key) back into a stored failReason.
function describeFailure(e) {
  const status = e?.status;
  if (isAuthError(e)) return 'AI grading is not authorized - check that GROQ_API_KEY is valid.';
  if (status === 404) return 'The configured AI model (' + config.groqModel + ') was not found or is not available to this API key.';
  if (status === 400 && /model/i.test(e?.error?.error?.message || e?.message || '')) return 'The configured AI model (' + config.groqModel + ') was not found or is not available to this API key.';
  if (status === 429) return 'AI grading hit a rate limit or quota.';
  if (status >= 500) return 'The AI service had a temporary problem.';
  if (isTimeout(e)) return 'AI evaluation timed out.';
  if (e?.message === INVALID || e?.message === NO_MARKS) return e.message;
  if (e?.message?.startsWith('AI grading is not configured')) return e.message;
  if (status === undefined) return 'Could not reach the AI service.';
  return 'AI evaluation failed unexpectedly.';
}

// Groq returns a Retry-After (seconds) or Retry-After-Ms header on 429s.
function retryDelayMs(e) {
  const ms = Number(e?.headers?.get?.('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(e?.headers?.get?.('retry-after'));
  return Number.isFinite(s) && s > 0 ? Math.ceil(s * 1000) : null;
}

async function callOnce(groq, prompt, maxMarks) {
  const response = await groq.chat.completions.create({
    model: config.groqModel,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: jsonSchema }
  }, { timeout: config.aiTimeoutMs, maxRetries: 0 });
  let parsed;
  try { parsed = JSON.parse(response.choices?.[0]?.message?.content); } catch { throw new Error(INVALID); }
  const u = response.usage || {};
  return {
    result: normalize(parsed, maxMarks),
    usage: { prompt: u.prompt_tokens || 0, output: u.completion_tokens || 0, thoughts: u.completion_tokens_details?.reasoning_tokens || 0, total: u.total_tokens || 0 }
  };
}

const { attempt } = createProviderAttempt({
  providerName: 'Groq', getModel: () => config.groqModel,
  getClient, callOnce, classify, describeFailure, retryDelayMs, isTimeout, isAuthError
});

export default attempt;
