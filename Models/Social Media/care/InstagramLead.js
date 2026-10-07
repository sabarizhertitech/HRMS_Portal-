const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

/**
 * InstagramLead — Lead Generation records captured from Instagram interactions.
 * Stores lead contact information (Name, Mobile, Email, Service/Requirement)
 * and sales/conversion status for the Support & Sales teams.
 */
const instagramLeadSchema = new mongoose.Schema(
  {
    leadId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    instagramUserId: {
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
      default: 'Instagram DM',
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
    collection: 'instagram_leads',
  }
);

module.exports =
  socialMediaDB.models.InstagramLead ||
  socialMediaDB.model('InstagramLead', instagramLeadSchema);
