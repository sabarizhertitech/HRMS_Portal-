const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

const instagramAiSettingsSchema = new mongoose.Schema(
  {
    // AI processing enabled (true = analyze messages and generate suggestions)
    dmAiEnabled: {
      type: Boolean,
      default: true,
    },
    // Automatic sending enabled (true = AI automatically sends replies to customer DMs)
    autoReplyEnabled: {
      type: Boolean,
      default: true,
    },
    // Comment AI — reserved for future use, currently always false
    commentAiEnabled: {
      type: Boolean,
      default: false,
    },
    // Minimum confidence score required before auto-sending (0.0 to 1.0)
    confidenceThreshold: {
      type: Number,
      default: 0.85,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
    collection: 'instagram_ai_settings',
  }
);

module.exports = socialMediaDB.models.InstagramAiSettings || socialMediaDB.model('InstagramAiSettings', instagramAiSettingsSchema);
