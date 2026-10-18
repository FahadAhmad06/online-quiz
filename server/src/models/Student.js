import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  rollNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  passwordHash: { type: String, required: true },
  sessionVersion: { type: Number, default: 0 }, // bumped on every login; invalidates older tokens
  loginFailCount: { type: Number, default: 0 },
  loginLockedUntil: { type: Date, default: null }
}, { timestamps: true });
export default mongoose.model('Student', schema);
