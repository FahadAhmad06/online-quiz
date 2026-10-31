import mongoose from 'mongoose';
// type 'mcq' uses options/correct; type 'subjective' uses the rest. rubric/keyConcepts/modelAnswer
// are grading-only and must never reach a student-facing payload (see attemptPayload.js).
const question = new mongoose.Schema({
  type: { type: String, enum: ['mcq', 'subjective'], default: 'mcq' },
  text: String, options: [String], correct: Number,
  maxMarks: Number, instructions: String, rubric: String, keyConcepts: [String], modelAnswer: String
}, { _id: false });
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  title: { type: String, required: true },
  perQ: { type: Number, default: 0 },          // seconds per question, 0 = no limit
  shuffle: { type: Boolean, default: true },
  questions: [question],
  startsAt: { type: Date, default: null },      // null = available immediately
  expiresAt: { type: Date, default: null },     // null = never expires
  createdBy: String,                            // legacy email string; kept for display
  // adminId: the Admin._id that owns this paper. Null for legacy papers created before multi-admin
  // support; the super-admin can see/manage all papers regardless of this field.
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true }
}, { timestamps: true });
export default mongoose.model('Paper', schema);
