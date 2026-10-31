import mongoose from 'mongoose';
// One started test. Holds the correct answers (and subjective rubric/model answer) on the server only.
const q = new mongoose.Schema({
  type: { type: String, enum: ['mcq', 'subjective'], default: 'mcq' },
  text: String, options: [String], correct: Number,
  maxMarks: Number, instructions: String, rubric: String, keyConcepts: [String], modelAnswer: String
}, { _id: false });

// One subjective question's grading lifecycle within an attempt. `idx` matches the question's
// position in `run`. finalMarks/finalFeedback are set only by an explicit admin approval - never
// by the AI directly - so a background retry can never silently change what a student sees.
const evaluation = new mongoose.Schema({
  idx: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'evaluating', 'awaiting_review', 'approved', 'manual_review', 'failed'], default: 'pending' },
  maxMarks: Number,
  suggestedMarks: { type: Number, default: null },
  feedback: { type: String, default: '' },
  strengths: { type: [String], default: [] },
  missingConcepts: { type: [String], default: [] },
  mistakes: { type: [String], default: [] },
  reasoningSummary: { type: String, default: '' },
  needsManualReview: { type: Boolean, default: false },
  failReason: { type: String, default: '' },
  retryCount: { type: Number, default: 0 },
  finalMarks: { type: Number, default: null },
  finalFeedback: { type: String, default: '' },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  // Grading-run bookkeeping. claimToken identifies the one run allowed to write a result; any
  // re-evaluation or admin decision clears it, so a slower, older run can never overwrite.
  claimToken: { type: String, default: null },
  claimedAt: { type: Date, default: null },
  failKind: { type: String, enum: ['transient', 'permanent', null], default: null },
  completedAt: { type: Date, default: null },
  retryAfter: { type: Date, default: null }, // provider quota reset; no automatic retry before it
  durationMs: { type: Number, default: null }, // claim -> persisted result, including retries
  aiMs: { type: Number, default: null },       // time inside AI provider calls only
  aiCalls: { type: Number, default: 0 },
  provider: { type: String, default: null },   // which AI provider actually graded this run (e.g. 'Gemini', 'Groq')
  model: { type: String, default: null },      // that provider's model id at the time
  fallbackUsed: { type: Boolean, default: false }, // true if the primary provider was skipped/failed and the fallback was used
  providersAttempted: { type: [String], default: [] }, // every provider tried (or skipped as unavailable) this run, in order
  usage: { type: mongoose.Schema.Types.Mixed, default: null }, // token counts reported by the provider
  history: { type: [mongoose.Schema.Types.Mixed], default: [] } // snapshots of earlier AI passes / admin decisions, for audit
}, { timestamps: true });

const schema = new mongoose.Schema({
  paperCode: String, paperTitle: String,
  name: String, roll: String, email: String,
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null }, // null for admin previews
  preview: { type: Boolean, default: false },
  submitted: { type: Boolean, default: false },
  run: [q],
  perQ: { type: Number, default: 0 },      // copied from Paper.perQ at creation; a deadline already in progress can't change
  idx: { type: Number, default: 0 },
  answers: { type: [Number], default: [] },      // mcq questions only; -1 = unanswered
  subjectiveText: { type: [String], default: [] }, // subjective questions only, same index as `run`
  evaluations: { type: [evaluation], default: [] }, // one entry per subjective question, added at submit time
  qEnd: { type: Date, default: null },
  startedAt: { type: Date, default: Date.now },
  attemptNumber: { type: Number, default: 1 }, // 2+ only after an admin-granted retake
  needsGrading: { type: Boolean, default: false } // true from submit until every subjective question is approved
}, { timestamps: true });
// Auto-clean old attempts after 3 days - but never one still awaiting subjective grading, so a
// review that takes longer than that doesn't lose the student's answers out from under the admin.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 86400, partialFilterExpression: { needsGrading: false } });
// Fast lookup of a student's attempts on a paper (start/resume/retake logic, admin retake list).
schema.index({ paperCode: 1, student: 1 });
// Fast lookup of attempts with evaluations in a given status, for the admin subjective dashboard.
schema.index({ 'evaluations.status': 1 });
export default mongoose.model('Attempt', schema);
