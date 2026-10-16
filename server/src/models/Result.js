import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  paperCode: { type: String, index: true }, paperTitle: String,
  name: String, roll: String, email: String,
  correct: Number, total: Number
}, { timestamps: true });
export default mongoose.model('Result', schema);
