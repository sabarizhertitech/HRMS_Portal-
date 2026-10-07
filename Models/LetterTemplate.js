const mongoose = require('mongoose');

const LetterTemplateSchema = new mongoose.Schema({
  letterType: {
    type: String,
    required: true,
    trim: true,
    enum: ['internship', 'appointment', 'intern-to-fulltime', 'additional-info', 'increment', 'termination']
  },
  isDefault: { type: Boolean, default: false },           // True for permanent default templates
  isActive: { type: Boolean, default: true },             // True if this template version is active
  subject: { type: String, default: '', trim: true },
  defaultHtml: { type: String, default: '', trim: true }, // Pristine default template HTML (never overwritten)
  customHtml: { type: String, default: '', trim: true },  // User's customized template HTML (stored separately)
  isCustomized: { type: Boolean, default: false },        // Flag indicating if custom template is currently active
  html: { type: String, default: '', trim: true },        // Active HTML (points to customHtml or defaultHtml)
  body1: { type: String, trim: true },
  body2: { type: String, trim: true },
  body3: { type: String, trim: true },
  body4: { type: String, trim: true },
  body5: { type: String, trim: true },
  body6: { type: String, trim: true },
  term1: { type: String, trim: true },
  term2: { type: String, trim: true },
  term3: { type: String, trim: true },
  term4: { type: String, trim: true },
  closing: { type: String, trim: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true }
}, {
  timestamps: true,
  strict: false
});

LetterTemplateSchema.index({ letterType: 1, isDefault: 1 });
LetterTemplateSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('LetterTemplate', LetterTemplateSchema);
