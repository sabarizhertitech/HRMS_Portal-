const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

/**
 * FacebookAiSettings — Admin-configurable AI behavior settings for Facebook Messenger.
 */
const facebookAiSettingsSchema = new mongoose.Schema(
  {
    globalAiEnabled: {
      type: Boolean,
      default: true,
    },
    autoTakeoverOnEscalation: {
      type: Boolean,
      default: true,
    },
    defaultTeam: {
      type: String,
      default: 'Support Desk',
    },
    notificationChannels: {
      type: [String],
      default: ['BELL', 'EMAIL'],
    },
    officeHoursOnly: {
      type: Boolean,
      default: false,
    },
    officeHoursStart: {
      type: String,
      default: '09:00',
    },
    officeHoursEnd: {
      type: String,
      default: '18:00',
    },
    welcomeMessage: {
      type: String,
      default: 'Hello! Welcome to Ertitech Facebook Care. How may we assist you today?',
    },
    handoffMessage: {
      type: String,
      default: "I've connected you with our support team. A specialist will assist you shortly.",
    },
    updatedBy: {
      type: String,
      default: 'admin',
    },
  },
  {
    timestamps: true,
    collection: 'facebook_ai_settings',
  }
);

// Explicit DB Connection or Fallback
const FacebookAiSettings = socialMediaDB
  ? socialMediaDB.model('FacebookAiSettings', facebookAiSettingsSchema)
  : mongoose.model('FacebookAiSettings', facebookAiSettingsSchema);

module.exports = FacebookAiSettings;
