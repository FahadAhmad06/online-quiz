#!/usr/bin/env node
/**
 * Migration: assign adminId to existing Papers, Results, AllowedRollNumbers, and RetakeGrants
 * that were created before multi-admin ownership was introduced.
 *
 * Strategy:
 *  - Paper:             createdBy email -> Admin._id lookup. Super-admin papers (owner email) -> null.
 *  - AllowedRollNumber: createdBy email -> Admin._id lookup.
 *  - RetakeGrant:       grantedBy email -> Admin._id lookup.
 *  - Result:            paperCode -> Paper.adminId propagation.
 *
 * Safety:
 *  - Only updates documents where adminId IS NULL (never overwrites existing ownership).
 *  - Papers created by an email that no longer has an Admin row get adminId=null and are logged.
 *    The super-admin can then reassign them via the UI or a follow-up script.
 *  - Never assigns all resources to every admin.
 *  - Dry-run mode (--dry-run) shows what would change without writing anything.
 *
 * Usage:
 *   node scripts/migrateOwnership.js            (live run)
 *   node scripts/migrateOwnership.js --dry-run  (preview only)
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const DRY = process.argv.includes('--dry-run');
if (DRY) console.log('[migrate] DRY-RUN mode: no writes will occur.\n');

// ---- inline schemas (avoid importing the full app) ----
const Admin = mongoose.model('Admin', new mongoose.Schema({ email: String, passwordHash: String }, { timestamps: true }));
const Paper = mongoose.model('Paper', new mongoose.Schema({
  code: String, title: String, createdBy: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { strict: false, timestamps: true }));
const Result = mongoose.model('Result', new mongoose.Schema({
  paperCode: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { strict: false, timestamps: true }));
const AllowedRollNumber = mongoose.model('AllowedRollNumber', new mongoose.Schema({
  rollNumber: String, createdBy: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { strict: false, timestamps: true }));
const RetakeGrant = mongoose.model('RetakeGrant', new mongoose.Schema({
  paperCode: String, grantedBy: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { strict: false, timestamps: true }));

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI is not set.'); process.exit(1); }
  await mongoose.connect(uri);
  console.log('[migrate] Connected to MongoDB.\n');

  // Build email -> adminId map from all Admin docs.
  const admins = await Admin.find().select('email').lean();
  const emailToId = new Map(admins.map(a => [a.email.toLowerCase(), a._id]));
  console.log('[migrate] Found ' + admins.length + ' admin account(s).\n');

  // ---- 1. Papers ----
  const papers = await Paper.find({ adminId: null }).select('code createdBy adminId').lean();
  console.log('[migrate] Papers without adminId: ' + papers.length);
  let paperFixed = 0, paperOrphaned = 0;
  const paperCodeToAdminId = new Map(); // used for Result/RetakeGrant propagation
  for (const p of papers) {
    const email = (p.createdBy || '').toLowerCase();
    const adminId = emailToId.get(email) || null;
    paperCodeToAdminId.set(p.code, adminId);
    if (adminId) {
      paperFixed++;
      if (!DRY) await Paper.updateOne({ _id: p._id, adminId: null }, { $set: { adminId } });
      else console.log('  [dry] Paper ' + p.code + ' (' + p.createdBy + ') -> adminId ' + adminId);
    } else {
      paperOrphaned++;
      console.warn('  [warn] Paper ' + p.code + ' createdBy "' + p.createdBy + '" has no matching Admin; adminId stays null (super-admin access only).');
    }
  }
  // Also build map for already-owned papers (so Results can inherit their adminId).
  const ownedPapers = await Paper.find({ adminId: { $ne: null } }).select('code adminId').lean();
  for (const p of ownedPapers) paperCodeToAdminId.set(p.code, p.adminId);
  console.log('[migrate] Papers: ' + paperFixed + ' fixed, ' + paperOrphaned + ' orphaned (adminId=null).\n');

  // ---- 2. Results (inherit from paper) ----
  const results = await Result.find({ adminId: null }).select('paperCode adminId').lean();
  console.log('[migrate] Results without adminId: ' + results.length);
  let resultFixed = 0, resultOrphaned = 0;
  for (const r of results) {
    const adminId = paperCodeToAdminId.get(r.paperCode) || null;
    if (adminId) {
      resultFixed++;
      if (!DRY) await Result.updateOne({ _id: r._id, adminId: null }, { $set: { adminId } });
    } else {
      resultOrphaned++;
    }
  }
  console.log('[migrate] Results: ' + resultFixed + ' fixed, ' + resultOrphaned + ' with no matching paper adminId (stay null).\n');

  // ---- 3. AllowedRollNumbers ----
  const rolls = await AllowedRollNumber.find({ adminId: null }).select('rollNumber createdBy').lean();
  console.log('[migrate] AllowedRollNumbers without adminId: ' + rolls.length);
  let rollFixed = 0, rollOrphaned = 0;
  for (const rn of rolls) {
    const email = (rn.createdBy || '').toLowerCase();
    const adminId = emailToId.get(email) || null;
    if (adminId) {
      rollFixed++;
      if (!DRY) await AllowedRollNumber.updateOne({ _id: rn._id, adminId: null }, { $set: { adminId } });
    } else {
      rollOrphaned++;
      console.warn('  [warn] AllowedRollNumber ' + rn.rollNumber + ' createdBy "' + rn.createdBy + '" has no matching Admin; stays null.');
    }
  }
  console.log('[migrate] AllowedRollNumbers: ' + rollFixed + ' fixed, ' + rollOrphaned + ' orphaned.\n');

  // ---- 4. RetakeGrants (inherit from paper) ----
  const grants = await RetakeGrant.find({ adminId: null }).select('paperCode grantedBy').lean();
  console.log('[migrate] RetakeGrants without adminId: ' + grants.length);
  let grantFixed = 0, grantOrphaned = 0;
  for (const g of grants) {
    const adminId = paperCodeToAdminId.get(g.paperCode) || null;
    if (adminId) {
      grantFixed++;
      if (!DRY) await RetakeGrant.updateOne({ _id: g._id, adminId: null }, { $set: { adminId } });
    } else {
      grantOrphaned++;
    }
  }
  console.log('[migrate] RetakeGrants: ' + grantFixed + ' fixed, ' + grantOrphaned + ' with no matching paper adminId (stay null).\n');

  console.log('[migrate] Done.' + (DRY ? ' (DRY-RUN: nothing was written)' : ''));
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
