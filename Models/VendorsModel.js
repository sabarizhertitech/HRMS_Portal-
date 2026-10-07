const mongoose = require('mongoose');

const vendorItemSchema = new mongoose.Schema({
  // Generic
  status: { type: String, default: 'Active' },
  approvalStatus: { type: String, enum: ['Draft', 'Pending', 'Approved', 'Rejected'], default: 'Draft' },
  reviewedBy: { type: String },
  rejectReason: { type: String },

  // Vendor Fields
  vendorName: { type: String },
  serviceProvided: { type: String },
  inScopeForPci: { type: String },
  dataAccessType: { type: String },
  contractAvailable: { type: String },
  responsibilityNotes: { type: String },
  reviewDate: { type: Date },

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

const vendorsDocumentSchema = new mongoose.Schema({
  // Single document container that holds everything
  documentId: { type: String, default: 'PCI-IV-001' },
  author: { type: String, default: 'Vishnu D (IT)' },
  reviewedBy: { type: String, default: 'Jayaprakash R (CISO)' },
  currentVersion: { type: String, default: '1' },
  dateOfCurrentVersion: { type: Date, default: Date.now },
  documentType: { type: String, default: 'Inscope Vendors Document' },
  owner: { type: String, default: 'IT Department' },

  vendors: [vendorItemSchema],
  revisionHistories: [revisionSchema]
}, { timestamps: true });

module.exports = mongoose.model('VendorsDoc', vendorsDocumentSchema);
