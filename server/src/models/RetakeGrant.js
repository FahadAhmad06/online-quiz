import mongoose from 'mongoose';
// An admin-issued one-time permission for a specific student to retake a specific paper after
// already submitting it. Consumed (used:true) the moment the student starts the new attempt.
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  rollNumber: { type: String, required: true, uppercase: true, trim: true },
  paperCode: { type: String, required: true, uppercase: true, trim: true },
  grantedBy: String,
  used: { type: Boolean, default: false },
  usedAt: { type: Date, default: null },
  cancelled: { type: Boolean, default: false },
  cancelledAt: { type: Date, default: null },
  attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', default: null }
}, { timestamps: true });
// At most one *active* (unused) grant per student+paper at a time.
schema.index({ student: 1, paperCode: 1 }, { unique: true, partialFilterExpression: { used: false } });
export default mongoose.model('RetakeGrant', schema);
