import { GoogleGenAI, Type } from '@google/genai';
import config from '../config.js';
import { SYSTEM, normalize, INVALID, NO_MARKS } from './evalPrompt.js';
import { createProviderAttempt } from './evalRetryRunner.js';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    suggestedMarks: { type: Type.NUMBER, description: 'Marks awarded, from 0 to maxMarks.' },
    feedback: { type: Type.STRING, description: 'Question-specific feedback for the student, written for after admin approval.' },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Correct concepts the answer got right.' },
    missingConcepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Expected concepts the answer missed or left incomplete.' },
    mistakes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Factual or technical errors, if any.' },
    reasoningSummary: { type: Type.STRING, description: 'Short, student-appropriate explanation of how the marks were determined. No hidden chain-of-thought.' },
    needsManualReview: { type: Type.BOOLEAN, description: 'True if the question/rubric is ambiguous, the answer is unusual, or you are not confident grading it.' }
  },
  required: ['suggestedMarks', 'feedback', 'strengths', 'missingConcepts', 'mistakes', 'reasoningSummary', 'needsManualReview']
};

let client = null;
function getClient() {
  if (!config.geminiApiKey) throw new Error('AI grading is not configured (GEMINI_API_KEY missing).');
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

// Measured against the real API: a normal answer graded in ~8s, but adversarial/prompt-injection
// content (which the model correctly still resists) took 45-80s, apparently from extra internal
// deliberation - comfortably inside the default AI_TIMEOUT_MS.
const isTimeout = e => e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.cause?.name === 'TimeoutError';
const isAuthError = e => e?.status === 401 || e?.status === 403;

// transient = worth another call (rate limit, 5xx, timeout, network blip, malformed output);
// permanent = the same request will fail again (bad key, unknown model, bad request).
function classify(e) {
  const status = e?.status;
  if (status === 429) return 'transient';
  if (status === 408 || status >= 500) return 'transient';
  if (status >= 400) return 'permanent';
  if (isTimeout(e) || e?.message === INVALID || e?.message === NO_MARKS) return 'transient';
  if (e instanceof TypeError) return 'transient'; // fetch failed: DNS/connection reset
  return 'permanent';
}

// Turns an SDK error into a clear, admin-safe message - never the raw error object, which could
// otherwise echo the request (and the API key) back into a stored failReason.
function describeFailure(e) {
  const status = e?.status;
  if (isAuthError(e)) return 'AI grading is not authorized - check that GEMINI_API_KEY is valid.';
  if (status === 404) return 'The configured AI model (' + config.geminiModel + ') was not found or is not available to this API key.';
  if (status === 429) return 'AI grading hit a rate limit or quota.';
  if (status >= 500) return 'The AI service had a temporary problem.';
  if (isTimeout(e)) return 'AI evaluation timed out.';
  if (e?.message === INVALID || e?.message === NO_MARKS) return e.message;
  if (e?.message?.startsWith('AI grading is not configured')) return e.message;
  if (e instanceof TypeError) return 'Could not reach the AI service.';
  return 'AI evaluation failed unexpectedly.';
}

// Google returns RetryInfo with a 429 ("retryDelay": "12s"); the SDK keeps the JSON body as the message.
function retryDelayMs(e) {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(e?.message || '');
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

async function callOnce(ai, prompt, maxMarks) {
  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM, responseMimeType: 'application/json', responseSchema, temperature: 0.2,
      ...(config.geminiThinkingLevel ? { thinkingConfig: { thinkingLevel: config.geminiThinkingLevel } } : {}),
      abortSignal: AbortSignal.timeout(config.aiTimeoutMs)
    }
  });
  let parsed;
  try { parsed = JSON.parse(response.text); } catch { throw new Error(INVALID); }
  const u = response.usageMetadata || {};
  return {
    result: normalize(parsed, maxMarks),
    usage: { prompt: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, thoughts: u.thoughtsTokenCount || 0, total: u.totalTokenCount || 0 }
  };
}

const { attempt } = createProviderAttempt({
  providerName: 'Gemini', getModel: () => config.geminiModel,
  getClient, callOnce, classify, describeFailure, retryDelayMs, isTimeout, isAuthError
});

export default attempt;
