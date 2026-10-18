import mongoose from 'mongoose';
// Admin-managed allowlist: a roll number must appear here, enabled and unregistered, with a
// matching PIN, before a student can register.
const schema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  pinHash: { type: String, default: null }, // cleared once consumed by a successful registration
  isEnabled: { type: Boolean, default: true },
  isRegistered: { type: Boolean, default: false },
  registeredStudent: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  pinFailCount: { type: Number, default: 0 },
  pinLockedUntil: { type: Date, default: null },
  createdBy: String
}, { timestamps: true });
export default mongoose.model('AllowedRollNumber', schema);
