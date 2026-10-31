import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  paperCode: { type: String, index: true }, paperTitle: String,
  name: String, roll: String, email: String,
  correct: Number, total: Number,
  // Null for results created before this field existed. Lets a subjective re-evaluation update
  // this same Result in place instead of creating a duplicate when the attempt is re-finalized.
  attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', default: null },
  // adminId: the Admin._id that owns the paper this result is for.
  // Null for legacy results created before multi-admin support.
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true }
}, { timestamps: true });
export default mongoose.model('Result', schema);
