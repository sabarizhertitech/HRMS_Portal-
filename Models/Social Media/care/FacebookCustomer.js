const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

/**
 * FacebookCustomer — CRM identity record for Facebook Messenger customers.
 * Stores ONLY basic customer information required for CRM operation.
 * NEVER stores message text, conversation transcripts, or chat history.
 */
const facebookCustomerSchema = new mongoose.Schema(
  {
    facebookUserId: {
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
      default: 'Facebook User',
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
    collection: 'facebook_customers',
  }
);

// Explicit DB Connection or Fallback
const FacebookCustomer = socialMediaDB
  ? socialMediaDB.model('FacebookCustomer', facebookCustomerSchema)
  : mongoose.model('FacebookCustomer', facebookCustomerSchema);

module.exports = FacebookCustomer;
