const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

/**
 * InstagramConversation — Persistent conversation/session control state.
 * This is NOT message content — it is CRM control state only.
 * Stores: AI mode, human support state, escalation metadata, attempt counters.
 * MongoDB is the authoritative source of truth for aiMode.
 */
const instagramConversationSchema = new mongoose.Schema(
  {
    instagramUserId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // AI mode: authoritative source of truth (MongoDB)
    // AI   — AI is handling the conversation automatically
    // HUMAN — Human agent has taken over; AI is paused
    // PAUSED — Manually paused (admin action)
    aiMode: {
      type: String,
      enum: ['AI', 'HUMAN', 'PAUSED'],
      default: 'AI',
    },

    // Conversation lifecycle status
    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED', 'CLOSED'],
      default: 'ACTIVE',
    },

    // Human support state
    humanSupportRequired: {
      type: Boolean,
      default: false,
    },
    assignedTeam: {
      type: String,
      default: null,
    },
    assignedAgent: {
      type: String,
      default: null,
    },

    // Escalation metadata — intent/reason that triggered human handoff
    // Does NOT contain customer message text
    escalationReason: {
      type: String,
      default: null,
    },
    escalationIntent: {
      type: String,
      enum: [
        'GENERAL_INFORMATION',
        'PRODUCT_INFORMATION',
        'TECHNICAL_QUERY',
        'PAYMENT_QUERY',
        'TRANSACTION_ISSUE',
        'ACCOUNT_ISSUE',
        'COMPLAINT',
        'ESCALATION',
        'HUMAN_REQUEST',
        'UNRESOLVED',
        'GENERAL_CONVERSATION',
        null,
      ],
      default: null,
    },

    // Support Ticket Lifecycle
    ticketId: {
      type: String,
      default: null,
      index: true,
    },
    ticketStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED'],
      default: 'NONE',
    },
    serviceRequested: {
      type: String,
      default: 'General Support',
    },
    ticketCreatedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: String,
      default: null,
    },

    // Counter to detect repeated AI failure (triggers escalation after limit)
    aiAttemptCount: {
      type: Number,
      default: 0,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'instagram_conversations',
  }
);

module.exports = socialMediaDB.models.InstagramConversation || socialMediaDB.model('InstagramConversation', instagramConversationSchema);
