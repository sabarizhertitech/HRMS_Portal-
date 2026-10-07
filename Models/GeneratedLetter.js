const mongoose = require('mongoose');

const GeneratedLetterSchema = new mongoose.Schema({
  letterType: {
    type: String,
    required: true,
    trim: true,
    index: true,
    enum: ['internship', 'appointment', 'intern-to-fulltime']
  },
  employeeName: { type: String, required: true, trim: true, index: true },
  dateOfIssue: { type: Date, required: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  signatoryName: { type: String, trim: true },
  signatoryTitle: { type: String, trim: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // type-specific fields like stipend, ctc etc.
  s3Key: { type: String, trim: true }, // Stores S3 bucket key for the generated PDF file
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }
}, {
  timestamps: true
});

GeneratedLetterSchema.index({ createdAt: 1 });

module.exports = mongoose.model('GeneratedLetter', GeneratedLetterSchema);
