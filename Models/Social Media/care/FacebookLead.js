const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

const facebookLeadSchema = new mongoose.Schema(
  {
    leadId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    facebookUserId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
      default: null,
    },
    serviceRequirement: {
      type: String,
      trim: true,
      default: 'General Inquiry',
    },
    source: {
      type: String,
      default: 'Facebook Messenger',
    },
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'IN_PROGRESS', 'QUALIFIED', 'CONVERTED', 'CLOSED'],
      default: 'NEW',
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
    assignedAgent: {
      type: String,
      default: null,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'facebook_leads',
  }
);

// Explicit DB Connection or Fallback
const FacebookLead = socialMediaDB
  ? socialMediaDB.model('FacebookLead', facebookLeadSchema)
  : mongoose.model('FacebookLead', facebookLeadSchema);

module.exports = FacebookLead;
