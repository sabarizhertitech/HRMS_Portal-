const mongoose = require('mongoose');

const IncrementLetterSchema = new mongoose.Schema({
  employeeName: { type: String, required: true, trim: true, index: true },
  previousSalary: { type: Number, required: true },
  newSalary: { type: Number, required: true },
  incrementPercentage: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  dateOfIssue: { type: Date, required: true },
  effectiveFrom: { type: String, trim: true },
  signatoryName: { type: String, trim: true },
  signatoryTitle: { type: String, trim: true },
  allowances: {
    type: [
      {
        label: { type: String, trim: true },
        amount: { type: Number }
      }
    ],
    default: []
  },
  s3Key: { type: String, trim: true }, // Stores S3 bucket key for the generated PDF file
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }
}, {
  timestamps: true
});

IncrementLetterSchema.index({ createdAt: 1 });

module.exports = mongoose.model('IncrementLetter', IncrementLetterSchema);
