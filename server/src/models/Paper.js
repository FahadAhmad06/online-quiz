import mongoose from 'mongoose';
const question = new mongoose.Schema({ text: String, options: [String], correct: Number }, { _id: false });
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  title: { type: String, required: true },
  perQ: { type: Number, default: 0 },          // seconds per question, 0 = no limit
  shuffle: { type: Boolean, default: true },
  questions: [question],
  startsAt: { type: Date, default: null },      // null = available immediately
  expiresAt: { type: Date, default: null },     // null = never expires
  createdBy: String
}, { timestamps: true });
export default mongoose.model('Paper', schema);
