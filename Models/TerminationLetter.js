const mongoose = require('mongoose');

const TerminationLetterSchema = new mongoose.Schema({
  employeeName: { type: String, required: true, trim: true, index: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  dateOfIssue: { type: Date, required: true },
  effectiveDate: { type: String, trim: true },
  noticePeriod: { type: String, trim: true },
  reason: { type: String, trim: true },
  settlementStatus: { type: String, trim: true },
  signatoryName: { type: String, trim: true },
  signatoryTitle: { type: String, trim: true },
  s3Key: { type: String, trim: true }, // Stores S3 bucket key for the generated PDF file
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }
}, {
  timestamps: true
});

TerminationLetterSchema.index({ createdAt: 1 });

module.exports = mongoose.model('TerminationLetter', TerminationLetterSchema);
