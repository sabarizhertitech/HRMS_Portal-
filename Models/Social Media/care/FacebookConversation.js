const mongoose = require('mongoose');
const { socialMediaDB } = require('../../../utils/dbConnections');

/**
 * FacebookConversation — Persistent conversation/session control state.
 * Stores: AI mode, human support state, escalation metadata, ticket status.
 * MongoDB is the authoritative source of truth for aiMode.
 */
const facebookConversationSchema = new mongoose.Schema(
  {
    facebookUserId: {
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

    // Ticket workflow tracking for human support desk
    ticketId: {
      type: String,
      default: null,
      index: true,
    },
    ticketStatus: {
      type: String,
      enum: ['OPEN', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED', null],
      default: null,
    },
    supportRequestedAt: {
      type: Date,
      default: null,
    },
    supportAcceptedAt: {
      type: Date,
      default: null,
    },
    supportClosedAt: {
      type: Date,
      default: null,
    },

    // State change timestamps
    modeUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'facebook_conversations',
  }
);

// Explicit DB Connection or Fallback
const FacebookConversation = socialMediaDB
  ? socialMediaDB.model('FacebookConversation', facebookConversationSchema)
  : mongoose.model('FacebookConversation', facebookConversationSchema);

module.exports = FacebookConversation;
