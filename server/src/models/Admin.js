import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  isEnabled: { type: Boolean, default: true },
  // Required for every admin created from now on (enforced in the route, not the schema); left
  // blank, not backfilled, for accounts created before this field existed - displayName.js falls
  // back to the email's local part for those so every caller always has something safe to show.
  name: { type: String, trim: true, default: '' }
}, { timestamps: true });
export default mongoose.model('Admin', schema);
