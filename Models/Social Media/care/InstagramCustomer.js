const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

/**
 * InstagramCustomer — CRM identity record for Instagram customers.
 * Stores ONLY basic customer information required for CRM operation.
 * NEVER stores message text, conversation transcripts, or chat history.
 */
const instagramCustomerSchema = new mongoose.Schema(
  {
    instagramUserId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
      default: null,
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    profilePictureUrl: {
      type: String,
      default: null,
    },
    accountType: {
      type: String,
      default: 'Instagram User',
    },

    // CRM metadata — no message content
    leadStatus: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'CLOSED'],
      default: 'NEW',
    },
    productInterest: {
      type: String,
      default: null,
    },

    // Timestamps for CRM activity tracking
    firstSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'instagram_customers',
  }
);

module.exports = socialMediaDB.models.InstagramCustomer || socialMediaDB.model('InstagramCustomer', instagramCustomerSchema);
