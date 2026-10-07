const mongoose = require('mongoose');

const paymentScriptItemSchema = new mongoose.Schema({
  // Generic
  status: { type: String, default: 'Active' },
  approvalStatus: { type: String, enum: ['Draft', 'Pending', 'Approved', 'Rejected'], default: 'Draft' },
  rejectReason: { type: String },

  // Authorized Payment Script Fields
  scriptName: { type: String },
  sourceDomain: { type: String },
  purpose: { type: String },
  authorizedBy: { type: String },
  lastUpdatedDate: { type: Date },
  auditReviewDate: { type: Date },

  // Batch grouping: records submitted together share the same batchId
  batchId: { type: String, default: null },
}, { timestamps: true });

const revisionSchema = new mongoose.Schema({
  changeDate: { type: Date },
  changeDescription: { type: String },
  changeEffectiveDate: { type: Date },
  oldVersion: { type: String },
  newVersion: { type: String },
  changeDoneBy: { type: String },
  changeReviewedAndApprovedBy: { type: String },
  approvalStatus: { type: String, enum: ['Draft', 'Pending', 'Approved', 'Rejected'], default: 'Draft' },
  rejectReason: { type: String }
}, { timestamps: true });

const paymentScriptDocumentSchema = new mongoose.Schema({
  // Document Information (Singleton fields)
  author: { type: String },
  documentId: { type: String, default: 'PCI-RR-001' },
  currentVersion: { type: String },
  dateOfCurrentVersion: { type: Date },
  documentType: { type: String },
  owner: { type: String },

  // Arrays of records
  paymentScripts: [paymentScriptItemSchema],
  revisionHistories: [revisionSchema]
}, { timestamps: true });

const PaymentScriptDoc = mongoose.model('PaymentScriptDoc', paymentScriptDocumentSchema);

module.exports = PaymentScriptDoc;
