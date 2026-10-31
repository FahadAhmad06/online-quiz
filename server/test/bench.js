// Reproducible evaluation benchmark against the MOCKED Gemini API (see helpers/fakeGemini.js).
// Drives the real HTTP submit route and measures, per scenario, the wall time from POST /submit
// until every subjective answer has left pending/evaluating (i.e. an AI result or failure is
// persisted). Numbers measure this app's orchestration, not real Gemini latency.
//
//   node test/bench.js [--src <path to a server src dir>] [--latency 500] [--runs 3]
import './helpers/env.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMongod } from './helpers/mongod.js';
import { installFakeGemini } from './helpers/fakeGemini.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SRC = path.resolve(arg('src', path.join(import.meta.dirname, '../src')));
const LATENCY = Number(arg('latency', 500));
const RUNS = Number(arg('runs', 3));
const imp = p => import(pathToFileURL(path.join(SRC, p)).href);

const mongod = await startMongod();
const fake = installFakeGemini({ latencyMs: LATENCY });
const { default: app } = await imp('app.js');
const { default: connectDb } = await imp('db.js');
const { default: Attempt } = await imp('models/Attempt.js');
const { default: Student } = await imp('models/Student.js');
const { default: signToken } = await imp('utils/signToken.js');
const mongoose = (await import('mongoose')).default;
await connectDb();
await mongoose.connection.db.dropDatabase();
const server = app.listen(0);
const base = 'http://127.0.0.1:' + server.address().port + '/api';

let seq = 0;
async function makeAttempt(answers) {
  const n = ++seq;
  const student = await Student.create({ name: 'Bench ' + n, rollNumber: 'B' + n, passwordHash: 'x' });
  const run = answers.map((_, i) => ({ type: 'subjective', text: 'Explain concept ' + i, maxMarks: 10, rubric: 'Award marks for correctness.', keyConcepts: ['a'], modelAnswer: 'ref' }));
  const a = await Attempt.create({
    paperCode: 'BENCH', paperTitle: 'Bench', name: student.name, roll: student.rollNumber, student: student._id,
    run, idx: run.length - 1, subjectiveText: answers, answers: run.map(() => -1)
  });
  return { id: String(a._id), token: signToken({ sub: String(student._id), roll: student.rollNumber, v: 0 }) };
}

async function submitAndWait({ id, token }) {
  const t0 = performance.now();
  const res = await fetch(base + '/attempts/' + id + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}' });
  if (!res.ok) throw new Error('submit failed ' + res.status + ' ' + await res.text());
  const submitMs = performance.now() - t0;
  for (;;) {
    const a = await Attempt.findById(id).select('evaluations.status').lean();
    if (a.evaluations.length && a.evaluations.every(e => !['pending', 'evaluating'].includes(e.status))) break;
    await new Promise(r => setTimeout(r, 10));
  }
  return { submitMs, doneMs: performance.now() - t0 };
}

const SCENARIOS = [
  { name: '1 answer, 1 student', students: 1, answers: 1 },
  { name: '5 answers, 1 student', students: 1, answers: 5 },
  { name: '10 answers, 1 student', students: 1, answers: 10 },
  { name: '3 answers x 5 students concurrently', students: 5, answers: 3 }
];
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

console.log('src=' + SRC + ' mockLatency=' + LATENCY + 'ms runs=' + RUNS + ' EVAL_CONCURRENCY=' + (process.env.EVAL_CONCURRENCY || '(default)'));
const rows = [];
for (const sc of SCENARIOS) {
  const done = [], submit = [], calls = [], peak = [];
  for (let r = 0; r < RUNS; r++) {
    const attempts = await Promise.all(Array.from({ length: sc.students }, (_, s) =>
      makeAttempt(Array.from({ length: sc.answers }, (_, i) => `Answer ${seq}-${s}-${i}-${r}`))));
    const c0 = fake.stats.calls; fake.stats.maxInFlight = 0;
    const t0 = performance.now();
    const out = await Promise.all(attempts.map(submitAndWait));
    done.push(performance.now() - t0);
    submit.push(Math.max(...out.map(o => o.submitMs)));
    calls.push(fake.stats.calls - c0); peak.push(fake.stats.maxInFlight);
  }
  rows.push({ scenario: sc.name, 'all graded (median ms)': Math.round(median(done)), 'submit response (median ms)': Math.round(median(submit)),
    'Gemini calls': median(calls), 'expected calls': sc.students * sc.answers, 'peak concurrent calls': median(peak) });
}
console.table(rows);
console.log(JSON.stringify(rows));

server.close();
await mongoose.disconnect();
fake.restore();
await mongod.stop();
