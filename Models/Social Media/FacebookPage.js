const mongoose = require('mongoose');
const { socialMediaDB } = require('../../utils/dbConnections');

// Schema for Facebook Page connection details
const facebookPageSchema = new mongoose.Schema(
  {
    pageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    pageName: {
      type: String,
      default: 'Ertitech',
      trim: true,
    },
    pageAccessToken: {
      type: String,
      default: '',
      select: false, // Security: Never leak token in default queries
    },
    category: {
      type: String,
      default: 'IT Solutions & Business Services',
      trim: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CONNECTED', 'DISCONNECTED'],
      default: 'ACTIVE',
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastInteractionAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'facebook_pages',
  }
);

// Schema for Facebook Messenger Messages
const facebookMessageSchema = new mongoose.Schema(
  {
    pageId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    recipientId: {
      type: String,
      required: true,
      trim: true,
    },
    messageId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    text: {
      type: String,
      default: '',
    },
    direction: {
      type: String,
      enum: ['INCOMING', 'OUTGOING'],
      default: 'INCOMING',
    },
    attachments: [
      {
        type: { type: String },
        url: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ['RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED'],
      default: 'RECEIVED',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'facebook_messages',
  }
);

facebookPageSchema.methods.toPublicProfile = function () {
  return {
    id: this._id,
    pageId: this.pageId,
    pageName: this.pageName,
    category: this.category,
    status: this.status,
    connectedAt: this.connectedAt,
    lastInteractionAt: this.lastInteractionAt,
    updatedAt: this.updatedAt,
  };
};

const FacebookPage = socialMediaDB.models.FacebookPage || socialMediaDB.model('FacebookPage', facebookPageSchema);
const FacebookMessage = socialMediaDB.models.FacebookMessage || socialMediaDB.model('FacebookMessage', facebookMessageSchema);

module.exports = FacebookPage;
module.exports.FacebookPage = FacebookPage;
module.exports.FacebookMessage = FacebookMessage;
