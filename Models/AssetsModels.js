const mongoose = require('mongoose');

const subItemSchema = new mongoose.Schema({
  // Generic
  status: { type: String, default: 'Active' },
  approvalStatus: { type: String, enum: ['Draft', 'Pending', 'Approved', 'Rejected'], default: 'Draft' },
  reviewedBy: { type: String },
  reviewDate: { type: Date },
  rejectReason: { type: String },

  // Access Review
  user: { type: String },
  role: { type: String },
  awsConsole: { type: String },
  ec2Server: { type: String },
  database: { type: String },
  kmsSecrets: { type: String },
  gitRepository: { type: String },
  firewallWaf: { type: String },
  productionDeploy: { type: String },

  // Firewall Rule
  firewallType: { type: String },
  ruleId: { type: String },
  source: { type: String },
  destination: { type: String },
  action: { type: String },
  businessJustification: { type: String },
  implementedBy: { type: String },

  // Batch grouping: records submitted together share the same batchId
  batchId: { type: String, default: null },

  // Custom fields manually added by the user
  customFields: [{
    label:        { type: String },
    type:         { type: String, default: 'text' },  // 'text' | 'textarea' | 'radio'
    radioOptions: [{ type: String }],                 // options for radio type
    value:        { type: String }
  }],
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

const auditDocumentSchema = new mongoose.Schema({
  // Document Information (Singleton fields)
  author: { type: String },
  reviewedBy: { type: String },
  documentId: { type: String, default: 'PCI-RR-001' },
  currentVersion: { type: String },
  dateOfCurrentVersion: { type: Date },
  documentType: { type: String },
  owner: { type: String },

  // Arrays of records
  accessReviews: [subItemSchema],
  firewallRules: [subItemSchema],
  revisionHistories: [revisionSchema]
}, { timestamps: true });

const Asset = mongoose.model('Asset', auditDocumentSchema);

module.exports = Asset;
