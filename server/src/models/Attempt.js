import mongoose from 'mongoose';
// One started test. Holds the correct answers on the server only.
const q = new mongoose.Schema({ text: String, options: [String], correct: Number }, { _id: false });
const schema = new mongoose.Schema({
  paperCode: String, paperTitle: String,
  name: String, roll: String, email: String,
  preview: { type: Boolean, default: false },
  submitted: { type: Boolean, default: false },
  run: [q]
}, { timestamps: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 86400 }); // auto-clean old attempts
export default mongoose.model('Attempt', schema);
