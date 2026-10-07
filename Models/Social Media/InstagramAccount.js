const mongoose = require('mongoose');
const { socialMediaDB } = require('../../utils/dbConnections');

const instagramAccountSchema = new mongoose.Schema(
  {
    instagramUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    profilePictureUrl: {
      type: String,
      default: '',
    },
    accountType: {
      type: String,
      default: 'BUSINESS',
      trim: true,
    },
    status: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'EXPIRED'],
      default: 'CONNECTED',
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    followersCount: {
      type: Number,
      default: 0,
    },
    followsCount: {
      type: Number,
      default: 0,
    },
    mediaCount: {
      type: Number,
      default: 0,
    },
    dailySnapshots: [
      {
        date: {
          type: String,
          required: true,
        },
        followersCount: {
          type: Number,
          default: 0,
        },
        followsCount: {
          type: Number,
          default: 0,
        },
        mediaCount: {
          type: Number,
          default: 0,
        },
        reach: {
          type: Number,
          default: 0,
        },
        impressions: {
          type: Number,
          default: 0,
        },
        engagement: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'instagram_accounts',
  }
);

// Method to format public safe account data for frontend
instagramAccountSchema.methods.toPublicProfile = function () {
  return {
    id: this.instagramUserId || this._id,
    instagramUserId: this.instagramUserId,
    username: this.username,
    name: this.name,
    profilePictureUrl: this.profilePictureUrl,
    accountType: this.accountType || 'Professional Account',
    status: this.status,
    connectedAt: this.connectedAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = socialMediaDB.models.InstagramAccount || socialMediaDB.model('InstagramAccount', instagramAccountSchema);
