// Prints which Gemini quota a 429 refers to (metric, limit, retry delay) for the configured key
// and model, using one tiny request. Never prints the API key.   node scripts/diagnoseQuota.js
import { GoogleGenAI } from '@google/genai';
import config from '../src/config.js';

const redact = s => String(s).split(config.geminiApiKey).join('[key]').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]');
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const t0 = performance.now();
try {
  const r = await ai.models.generateContent({ model: config.geminiModel, contents: 'Reply with the word OK.', config: { abortSignal: AbortSignal.timeout(60000) } });
  console.log('OK in ' + Math.round(performance.now() - t0) + 'ms:', JSON.stringify(r.text).slice(0, 40), 'tokens:', r.usageMetadata?.totalTokenCount);
} catch (e) {
  console.log('Failed in ' + Math.round(performance.now() - t0) + 'ms, status ' + (e.status ?? e.name));
  let body; try { body = JSON.parse(e.message); } catch { console.log(redact(e.message).slice(0, 800)); }
  const err = body?.error;
  if (err) {
    console.log('message:', redact(err.message).slice(0, 600));
    for (const d of err.details || []) {
      if (d.violations) for (const v of d.violations) console.log('quota violated:', v.quotaMetric, '| id:', v.quotaId, '| limit:', v.quotaValue ?? '?', '| dims:', JSON.stringify(v.quotaDimensions || {}));
      if (d.retryDelay) console.log('retryDelay:', d.retryDelay);
    }
  }
}
