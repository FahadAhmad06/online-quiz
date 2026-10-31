// adminFilter.js — Derives ownership filter from the verified JWT (req.admin).
// - Super-admin (isSuper=true / adminId='super'): returns {} so they see all data.
// - Regular admin: returns { adminId: mongoose.Types.ObjectId(adminId) }
// - paperCodeFilter: same, but filters on a field matching paper codes the admin owns.
//
// NEVER call these with a client-supplied adminId. Always use req.admin from requireAdmin.
import mongoose from 'mongoose';

/**
 * Returns a Mongoose filter object for resources that have an `adminId` field.
 * Super-admin gets no filter (sees all). Regular admins get { adminId: <ObjectId> }.
 */
export function ownerFilter(req) {
  if (req.admin.isSuper) return {};
  return { adminId: new mongoose.Types.ObjectId(req.admin.adminId) };
}

/**
 * Returns the admin's ObjectId, or null for super-admin.
 * Use this when setting adminId on newly created resources.
 */
export function adminObjectId(req) {
  if (req.admin.isSuper) return null; // super has no Admin doc
  return new mongoose.Types.ObjectId(req.admin.adminId);
}

/**
 * Given a list of paper codes the admin owns, returns a filter { paperCode: { $in: codes } }.
 * If the admin is super, returns {} (no filter).
 * Pass `null` for paperCodes when admin is super.
 */
export function paperCodeFilter(req, paperCodes) {
  if (req.admin.isSuper) return {};
  return { paperCode: { $in: paperCodes } };
}

/**
 * Verify that a document's adminId matches the current admin (or admin is super).
 * Returns true if authorized, false if not.
 */
export function isOwner(req, doc) {
  if (req.admin.isSuper) return true;
  if (!doc) return false;
  const docAdminId = doc.adminId ? String(doc.adminId) : null;
  // Legacy documents (adminId = null) are only accessible by super-admin.
  // Regular admins can only see their own documents.
  return docAdminId !== null && docAdminId === String(req.admin.adminId);
}
