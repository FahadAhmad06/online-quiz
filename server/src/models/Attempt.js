import mongoose from 'mongoose';
// One started test. Holds the correct answers on the server only.
const q = new mongoose.Schema({ text: String, options: [String], correct: Number }, { _id: false });
const schema = new mongoose.Schema({
  paperCode: String, paperTitle: String,
  name: String, roll: String, email: String,
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null }, // null for admin previews
  preview: { type: Boolean, default: false },
  submitted: { type: Boolean, default: false },
  run: [q],
  perQ: { type: Number, default: 0 },      // copied from Paper.perQ at creation; a deadline already in progress can't change
  idx: { type: Number, default: 0 },
  answers: { type: [Number], default: [] },
  qEnd: { type: Date, default: null },
  startedAt: { type: Date, default: Date.now },
  attemptNumber: { type: Number, default: 1 } // 2+ only after an admin-granted retake
}, { timestamps: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 86400 }); // auto-clean old attempts
// Fast lookup of a student's attempts on a paper (start/resume/retake logic, admin retake list).
schema.index({ paperCode: 1, student: 1 });
export default mongoose.model('Attempt', schema);
